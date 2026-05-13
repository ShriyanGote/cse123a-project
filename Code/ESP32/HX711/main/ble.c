/*
 * CSE 123A — Custom BLE provisioning (same GATT contract as custom_ble_prov).
 *
 * QR JSON: {"device_name":"ESP32_XXX","device_id":"..."}
 * GATT: AUTH (write) + WIFI (write) + STATUS (read/notify)
 * Mobile sends base64(UTF-8) on AUTH (UUID string) and base64("ssid:password") on WIFI.
 *
 * After WIFI write: persist auth_token + SSID + password to NVS namespace "prov"
 * (via wifi_prov_save), notify "saved_restarting", then reboot — same as
 * custom_ble_prov. On next boot main.c loads credentials and connects Wi-Fi.
 */
#include <assert.h>
#include <stdio.h>
#include <string.h>

#include "wifi_manager.h"
#include "esp_log.h"
#include "esp_nimble_hci.h"
#include "esp_event.h"
#include "esp_system.h"

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include "nimble/nimble_port.h"
#include "nimble/nimble_port_freertos.h"
#include "host/ble_att.h"
#include "host/ble_gatt.h"
#include "host/ble_hs.h"
#include "host/ble_uuid.h"
#include "host/util/util.h"
#include "services/gap/ble_svc_gap.h"
#include "services/gatt/ble_svc_gatt.h"
#include "store/config/ble_store_config.h"

#include "mbedtls/base64.h"

#include "qrcode.h"
#include <stdbool.h>

#include "esp_mac.h"

static const char *TAG2 = "cse_ble_prov";
extern void ble_store_config_init(void);

/* 128-bit UUIDs — byte order for NimBLE BLE_UUID128_INIT (reverse of canonical string). */
static const ble_uuid128_t svc_uuid =
    BLE_UUID128_INIT(0x01, 0x8e, 0x2c, 0x4b, 0x2f, 0x9f, 0xc8, 0xa8, 0x61, 0x4d, 0x67, 0x92,
                     0x01, 0x00, 0xb4, 0xa0);
static const ble_uuid128_t chr_auth_uuid =
    BLE_UUID128_INIT(0x01, 0x8e, 0x2c, 0x4b, 0x2f, 0x9f, 0xc8, 0xa8, 0x61, 0x4d, 0x67, 0x92,
                     0x02, 0x00, 0xb4, 0xa0);
static const ble_uuid128_t chr_wifi_uuid =
    BLE_UUID128_INIT(0x01, 0x8e, 0x2c, 0x4b, 0x2f, 0x9f, 0xc8, 0xa8, 0x61, 0x4d, 0x67, 0x92,
                     0x03, 0x00, 0xb4, 0xa0);
static const ble_uuid128_t chr_status_uuid =
    BLE_UUID128_INIT(0x01, 0x8e, 0x2c, 0x4b, 0x2f, 0x9f, 0xc8, 0xa8, 0x61, 0x4d, 0x67, 0x92,
                     0x04, 0x00, 0xb4, 0xa0);

static char s_device_id[20];
static char s_device_name[24];
static char s_auth_token[96];
static char s_status[48] = "idle";
static uint16_t s_status_val_handle;
static uint16_t s_conn_handle = BLE_HS_CONN_HANDLE_NONE;

static int gatt_svr_chr_access(uint16_t conn_handle, uint16_t attr_handle,
                               struct ble_gatt_access_ctxt *ctxt, void *arg);

static void ble_app_advertise(void);
static int gap_event(struct ble_gap_event *event, void *arg);

static const struct ble_gatt_svc_def gatt_svr_svcs[] = {
    {
        .type = BLE_GATT_SVC_TYPE_PRIMARY,
        .uuid = &svc_uuid.u,
        .characteristics =
            (struct ble_gatt_chr_def[]){
                {.uuid = &chr_auth_uuid.u,
                 .access_cb = gatt_svr_chr_access,
                 .flags = BLE_GATT_CHR_F_WRITE | BLE_GATT_CHR_F_WRITE_NO_RSP},
                {.uuid = &chr_wifi_uuid.u,
                 .access_cb = gatt_svr_chr_access,
                 .flags = BLE_GATT_CHR_F_WRITE | BLE_GATT_CHR_F_WRITE_NO_RSP},
                {.uuid = &chr_status_uuid.u,
                 .access_cb = gatt_svr_chr_access,
                 .flags = BLE_GATT_CHR_F_READ | BLE_GATT_CHR_F_NOTIFY,
                 .val_handle = &s_status_val_handle},
                {0},
            },
    },
    {0},
};

static void set_status(const char *msg)
{
    strncpy(s_status, msg, sizeof s_status - 1);
    s_status[sizeof s_status - 1] = '\0';
    ESP_LOGI(TAG2, "status: %s", s_status);
}

static void notify_status(const char *msg)
{
    set_status(msg);
    if (s_conn_handle == BLE_HS_CONN_HANDLE_NONE) {
        return;
    }
    struct os_mbuf *om = ble_hs_mbuf_from_flat(msg, strlen(msg));
    if (!om) {
        return;
    }
    int rc = ble_gatts_notify_custom(s_conn_handle, s_status_val_handle, om);
    if (rc != 0) {
        ESP_LOGW(TAG2, "notify failed rc=%d", rc);
        os_mbuf_free_chain(om);
    }
}

/* Mobile sends base64(UUID); decode so Bearer token matches DB auth_token. */
static void decode_auth_token_inplace(char *buf, size_t cap)
{
    unsigned char tmp[128];
    size_t olen = 0;
    int r = mbedtls_base64_decode(tmp, sizeof(tmp), &olen, (const unsigned char *)buf, strlen(buf));
    if (r != 0 || olen == 0 || olen >= cap) {
        return;
    }
    memcpy(buf, tmp, olen);
    buf[olen] = '\0';
}

static void delayed_restart_task(void *arg)
{
    (void)arg;
    vTaskDelay(pdMS_TO_TICKS(800));
    ESP_LOGI(TAG2, "restarting to apply stored provisioning...");
    esp_restart();
}

static int handle_auth_write(struct os_mbuf *om)
{
    uint16_t pktlen = OS_MBUF_PKTLEN(om);
    ESP_LOGI(TAG2, "handle_auth_write called, pktlen=%d", pktlen);
    if (pktlen == 0 || pktlen >= sizeof(s_auth_token)) {
        return BLE_ATT_ERR_INVALID_ATTR_VALUE_LEN;
    }

    int rc = ble_hs_mbuf_to_flat(om, s_auth_token, sizeof(s_auth_token) - 1, NULL);
    if (rc != 0) {
        return BLE_ATT_ERR_UNLIKELY;
    }
    s_auth_token[pktlen] = '\0';

    decode_auth_token_inplace(s_auth_token, sizeof(s_auth_token));

    ESP_LOGI(TAG2, "auth token stored (len=%zu)", strlen(s_auth_token));
    notify_status("auth_ok");
    return 0;
}

static int handle_wifi_write(struct os_mbuf *om)
{
    uint16_t pktlen = OS_MBUF_PKTLEN(om);
    ESP_LOGI(TAG2, "handle_wifi_write called, pktlen=%d", pktlen);
    char wifi_str[256];
    if (pktlen == 0 || pktlen >= sizeof(wifi_str)) {
        return BLE_ATT_ERR_INVALID_ATTR_VALUE_LEN;
    }
    int rc = ble_hs_mbuf_to_flat(om, wifi_str, sizeof(wifi_str) - 1, NULL);
    if (rc != 0) {
        return BLE_ATT_ERR_UNLIKELY;
    }
    wifi_str[pktlen] = '\0';

    /* Optional: mobile sends base64("ssid:password") */
    char decoded[256];
    strncpy(decoded, wifi_str, sizeof decoded - 1);
    decoded[sizeof decoded - 1] = '\0';
    {
        unsigned char outb[256];
        size_t olen = 0;
        int r = mbedtls_base64_decode(outb, sizeof(outb), &olen, (const unsigned char *)decoded,
                                        strlen(decoded));
        if (r == 0 && olen > 0 && olen < sizeof decoded) {
            memcpy(decoded, outb, olen);
            decoded[olen] = '\0';
        }
    }

    char *colon = strchr(decoded, ':');
    if (!colon) {
        return BLE_ATT_ERR_INVALID_ATTR_VALUE_LEN;
    }
    *colon = '\0';
    const char *ssid = decoded;
    const char *pwd = colon + 1;

    if (s_auth_token[0] == '\0') {
        ESP_LOGW(TAG2, "wifi received but auth token not set yet");
        notify_status("auth_missing");
        return BLE_ATT_ERR_UNLIKELY;
    }

    esp_err_t err = wifi_prov_save(s_auth_token, ssid, pwd);
    if (err != ESP_OK) {
        ESP_LOGE(TAG2, "wifi_prov_save: %s", esp_err_to_name(err));
        notify_status("nvs_failed");
        return BLE_ATT_ERR_UNLIKELY;
    }

    ESP_LOGI(TAG2, "provisioning saved to NVS; restarting in ~1s");
    notify_status("saved_restarting");

    BaseType_t ok = xTaskCreate(delayed_restart_task, "prov_restart", 2048, NULL, 5, NULL);
    if (ok != pdPASS) {
        ESP_LOGE(TAG2, "failed to create restart task");
        return BLE_ATT_ERR_UNLIKELY;
    }
    return 0;
}

static int gatt_svr_chr_access(uint16_t conn_handle, uint16_t attr_handle, struct ble_gatt_access_ctxt *ctxt,
                             void *arg)
{
    (void)conn_handle;
    (void)attr_handle;
    (void)arg;

    if (ctxt->op == BLE_GATT_ACCESS_OP_READ_CHR) {
        if (ble_uuid_cmp(ctxt->chr->uuid, &chr_status_uuid.u) == 0) {
            int rc = os_mbuf_append(ctxt->om, s_status, strlen(s_status));
            return rc == 0 ? 0 : BLE_ATT_ERR_INSUFFICIENT_RES;
        }
        return BLE_ATT_ERR_UNLIKELY;
    }

    if (ctxt->op == BLE_GATT_ACCESS_OP_WRITE_CHR) {
        if (ble_uuid_cmp(ctxt->chr->uuid, &chr_auth_uuid.u) == 0) {
            return handle_auth_write(ctxt->om);
        }
        if (ble_uuid_cmp(ctxt->chr->uuid, &chr_wifi_uuid.u) == 0) {
            return handle_wifi_write(ctxt->om);
        }
    }
    return BLE_ATT_ERR_UNLIKELY;
}

static void gatt_svr_register_cb(struct ble_gatt_register_ctxt *ctxt, void *arg)
{
    (void)arg;
    char buf[BLE_UUID_STR_LEN];
    switch (ctxt->op) {
    case BLE_GATT_REGISTER_OP_CHR:
        ESP_LOGD(TAG2, "characteristic %s handle=%d", ble_uuid_to_str(ctxt->chr.chr_def->uuid, buf),
                 ctxt->chr.val_handle);
        break;
    default:
        break;
    }
}

static int gatt_svr_init(void)
{
    int rc;

    ble_svc_gap_init();
    ble_svc_gatt_init();

    rc = ble_gatts_count_cfg(gatt_svr_svcs);
    if (rc != 0) {
        return rc;
    }

    rc = ble_gatts_add_svcs(gatt_svr_svcs);
    if (rc != 0) {
        return rc;
    }

    return 0;
}

static void ble_app_advertise(void)
{
    struct ble_gap_adv_params adv_params;
    struct ble_hs_adv_fields fields;
    const char *name;
    int rc;

    memset(&fields, 0, sizeof fields);
    fields.flags = BLE_HS_ADV_F_DISC_GEN | BLE_HS_ADV_F_BREDR_UNSUP;
    fields.tx_pwr_lvl_is_present = 1;
    fields.tx_pwr_lvl = BLE_HS_ADV_TX_PWR_LVL_AUTO;

    name = ble_svc_gap_device_name();
    fields.name = (uint8_t *)name;
    fields.name_len = strlen(name);
    fields.name_is_complete = 1;

    rc = ble_gap_adv_set_fields(&fields);
    if (rc != 0) {
        ESP_LOGE(TAG2, "adv_set_fields failed rc=%d", rc);
        return;
    }

    memset(&adv_params, 0, sizeof adv_params);
    adv_params.conn_mode = BLE_GAP_CONN_MODE_UND;
    adv_params.disc_mode = BLE_GAP_DISC_MODE_GEN;
    rc = ble_gap_adv_start(BLE_OWN_ADDR_PUBLIC, NULL, BLE_HS_FOREVER, &adv_params, gap_event, NULL);
    if (rc != 0) {
        ESP_LOGE(TAG2, "adv_start failed rc=%d", rc);
    }
}

static int gap_event(struct ble_gap_event *event, void *arg)
{
    (void)arg;
    switch (event->type) {
    case BLE_GAP_EVENT_CONNECT:
        if (event->connect.status == 0) {
            s_conn_handle = event->connect.conn_handle;
            ESP_LOGI(TAG2, "connected handle=%d", s_conn_handle);
            int mtu_rc = ble_gattc_exchange_mtu(s_conn_handle, NULL, NULL);
            ESP_LOGI(TAG2, "MTU exchange requested rc=%d", mtu_rc);
        } else {
            s_conn_handle = BLE_HS_CONN_HANDLE_NONE;
            ble_app_advertise();
        }
        break;
    case BLE_GAP_EVENT_DISCONNECT:
        ESP_LOGI(TAG2, "disconnect reason=%d", event->disconnect.reason);
        s_conn_handle = BLE_HS_CONN_HANDLE_NONE;
        ble_app_advertise();
        break;
    case BLE_GAP_EVENT_ADV_COMPLETE:
        ble_app_advertise();
        break;
    case BLE_GAP_EVENT_MTU:
        ESP_LOGI(TAG2, "MTU negotiated conn=%d mtu=%d", event->mtu.conn_handle, event->mtu.value);
        break;
    default:
        break;
    }
    return 0;
}

static void on_reset(int reason)
{
    ESP_LOGE(TAG2, "nimble reset reason=%d", reason);
}

static void on_sync(void)
{
    int rc = ble_hs_util_ensure_addr(0);
    if (rc != 0) {
        ESP_LOGE(TAG2, "ensure_addr rc=%d", rc);
        return;
    }

    uint8_t own_addr_type;
    rc = ble_hs_id_infer_auto(0, &own_addr_type);
    if (rc != 0) {
        ESP_LOGE(TAG2, "infer_auto rc=%d", rc);
        return;
    }

    rc = ble_svc_gap_device_name_set(s_device_name);
    if (rc != 0) {
        ESP_LOGE(TAG2, "gap_device_name_set rc=%d", rc);
    }
    ble_app_advertise();
}

static void nimble_host_task(void *param)
{
    (void)param;
    nimble_port_run();
    nimble_port_freertos_deinit();
}

static void show_qr_payload(void)
{
    char payload[192];
    snprintf(payload, sizeof payload, "{\"device_name\":\"%s\",\"device_id\":\"%s\"}", s_device_name,
             s_device_id);
    ESP_LOGI(TAG2, "QR JSON (scan with app): %s", payload);
    esp_qrcode_config_t cfg = ESP_QRCODE_CONFIG_DEFAULT();
    esp_qrcode_generate(&cfg, payload);
}

static void init_device_ids(void)
{
    uint8_t mac[6];

    ESP_ERROR_CHECK(esp_read_mac(mac, ESP_MAC_WIFI_STA));

    snprintf(s_device_id, sizeof s_device_id, "%02x%02x%02x%02x%02x%02x", mac[0], mac[1], mac[2], mac[3],
             mac[4], mac[5]);

    snprintf(s_device_name, sizeof s_device_name, "ESP32_%02X%02X%02X", mac[3], mac[4], mac[5]);
}

esp_err_t ble_provisioning_init(void)
{
    init_device_ids();
    show_qr_payload();

    ESP_ERROR_CHECK(nimble_port_init());
    ble_att_set_preferred_mtu(512);

    ble_hs_cfg.reset_cb = on_reset;
    ble_hs_cfg.sync_cb = on_sync;
    ble_hs_cfg.gatts_register_cb = gatt_svr_register_cb;
    ble_hs_cfg.store_status_cb = ble_store_util_status_rr;
    ble_hs_cfg.sm_bonding = 0;
    ble_hs_cfg.sm_mitm = 0;
    ble_hs_cfg.sm_sc = 0;

    int rc = gatt_svr_init();
    assert(rc == 0);

    ble_store_config_init();
    nimble_port_freertos_init(nimble_host_task);
    return ESP_OK;
}
