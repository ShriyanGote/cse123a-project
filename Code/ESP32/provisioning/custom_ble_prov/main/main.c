/*
 * CSE 123A — Custom BLE provisioning (no Espressif wifi_prov_scheme_ble).
 *
 * QR JSON: {"device_name":"ESP32_XXX","device_id":"..."}
 * GATT: service + AUTH (write) + WIFI (write) + STATUS (read/notify)
 * Payloads: base64( UTF-8 JSON ). AUTH: {"auth_token":"<uuid>"}. WIFI: {"ssid","password"}
 *
 * Edit CSE123A_API_BASE to your deployed web-server origin (HTTPS).
 */
#include <assert.h>
#include <stdio.h>
#include <string.h>

#include "esp_log.h"
#include "esp_nimble_hci.h"
#include "esp_system.h"
#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_netif.h"
#include "esp_http_client.h"
#include "esp_crt_bundle.h"
#include "nvs.h"
#include "nvs_flash.h"

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

#include "cJSON.h"
#include "qrcode.h"

static const char *TAG = "cse_ble_prov";
extern void ble_store_config_init(void);

#ifndef CSE123A_API_BASE
#define CSE123A_API_BASE "https://cse123a-project-6a3s.vercel.app"
#endif

/* NVS namespace + keys where provisioning state is persisted. After a
 * successful BLE provisioning the firmware writes auth_token, ssid and
 * password to NVS, then reboots. On the next boot we skip BLE entirely
 * and connect to Wi-Fi using the stored credentials. */
#define PROV_NVS_NS        "prov"
#define PROV_KEY_AUTH      "auth_token"
#define PROV_KEY_SSID      "wifi_ssid"
#define PROV_KEY_PWD       "wifi_pwd"

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
    ESP_LOGI(TAG, "status: %s", s_status);
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
        ESP_LOGW(TAG, "notify failed rc=%d", rc);
        os_mbuf_free_chain(om);
    }
}

static esp_err_t prov_save_to_nvs(const char *auth_token, const char *ssid, const char *pwd)
{
    nvs_handle_t h;
    esp_err_t err = nvs_open(PROV_NVS_NS, NVS_READWRITE, &h);
    if (err != ESP_OK) return err;
    if ((err = nvs_set_str(h, PROV_KEY_AUTH, auth_token)) != ESP_OK) goto done;
    if ((err = nvs_set_str(h, PROV_KEY_SSID, ssid)) != ESP_OK) goto done;
    if ((err = nvs_set_str(h, PROV_KEY_PWD,  pwd))  != ESP_OK) goto done;
    err = nvs_commit(h);
done:
    nvs_close(h);
    return err;
}

static bool prov_load_from_nvs(char *auth_token, size_t auth_size,
                               char *ssid,       size_t ssid_size,
                               char *pwd,        size_t pwd_size)
{
    nvs_handle_t h;
    esp_err_t err = nvs_open(PROV_NVS_NS, NVS_READONLY, &h);
    if (err != ESP_OK) return false;

    size_t s;
    s = auth_size;
    if ((err = nvs_get_str(h, PROV_KEY_AUTH, auth_token, &s)) != ESP_OK) {
        nvs_close(h);
        return false;
    }
    s = ssid_size;
    if ((err = nvs_get_str(h, PROV_KEY_SSID, ssid, &s)) != ESP_OK) {
        nvs_close(h);
        return false;
    }
    s = pwd_size;
    err = nvs_get_str(h, PROV_KEY_PWD, pwd, &s);
    nvs_close(h);
    return err == ESP_OK;
}

/* Reboot from a non-BLE task so the BLE notify above has a chance to flush. */
static void delayed_restart_task(void *arg)
{
    (void)arg;
    vTaskDelay(pdMS_TO_TICKS(800));
    ESP_LOGI(TAG, "restarting to apply stored provisioning...");
    esp_restart();
}

static int handle_auth_write(struct os_mbuf *om)
{
    uint16_t pktlen = OS_MBUF_PKTLEN(om);
    ESP_LOGI(TAG, "handle_auth_write called, pktlen=%d", pktlen);
    if (pktlen == 0 || pktlen >= sizeof(s_auth_token)) {
        return BLE_ATT_ERR_INVALID_ATTR_VALUE_LEN;
    }

    int rc = ble_hs_mbuf_to_flat(om, s_auth_token, sizeof(s_auth_token) - 1, NULL);
    if (rc != 0) {
        return BLE_ATT_ERR_UNLIKELY;
    }
    s_auth_token[pktlen] = '\0';

    ESP_LOGI(TAG, "auth token stored: %s (len=%d)", s_auth_token, pktlen);
    notify_status("auth_ok");
    return 0;
}

static int handle_wifi_write(struct os_mbuf *om)
{
    uint16_t pktlen = OS_MBUF_PKTLEN(om);
    ESP_LOGI(TAG, "handle_wifi_write called, pktlen=%d", pktlen);
    char wifi_str[256];
    if (pktlen == 0 || pktlen >= sizeof(wifi_str)) {
        return BLE_ATT_ERR_INVALID_ATTR_VALUE_LEN;
    }
    int rc = ble_hs_mbuf_to_flat(om, wifi_str, sizeof(wifi_str) - 1, NULL);
    if (rc != 0) return BLE_ATT_ERR_UNLIKELY;
    wifi_str[pktlen] = '\0';

    ESP_LOGI(TAG, "wifi payload received (len=%d)", pktlen);

    char *colon = strchr(wifi_str, ':');
    if (!colon) return BLE_ATT_ERR_INVALID_ATTR_VALUE_LEN;
    *colon = '\0';
    const char *ssid = wifi_str;
    const char *pwd  = colon + 1;

    if (s_auth_token[0] == '\0') {
        ESP_LOGW(TAG, "wifi received but auth token not set yet");
        notify_status("auth_missing");
        return BLE_ATT_ERR_UNLIKELY;
    }

    /* Persist auth_token + Wi-Fi creds to NVS, then reboot. On the next
     * boot the firmware will skip BLE, connect to Wi-Fi automatically,
     * and POST /api/ingest with the saved auth token. */
    esp_err_t err = prov_save_to_nvs(s_auth_token, ssid, pwd);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "prov_save_to_nvs: %s", esp_err_to_name(err));
        notify_status("nvs_failed");
        return BLE_ATT_ERR_UNLIKELY;
    }

    ESP_LOGI(TAG, "provisioning saved to NVS; restarting in ~1s");
    notify_status("saved_restarting");

    BaseType_t ok = xTaskCreate(delayed_restart_task, "prov_restart", 2048, NULL, 5, NULL);
    if (ok != pdPASS) {
        ESP_LOGE(TAG, "failed to create restart task");
        return BLE_ATT_ERR_UNLIKELY;
    }
    return 0;
}

static int gatt_svr_chr_access(uint16_t conn_handle, uint16_t attr_handle,
                             struct ble_gatt_access_ctxt *ctxt, void *arg)
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
        ESP_LOGD(TAG, "characteristic %s handle=%d",
                 ble_uuid_to_str(ctxt->chr.chr_def->uuid, buf), ctxt->chr.val_handle);
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
        ESP_LOGE(TAG, "adv_set_fields failed rc=%d", rc);
        return;
    }

    memset(&adv_params, 0, sizeof adv_params);
    adv_params.conn_mode = BLE_GAP_CONN_MODE_UND;
    adv_params.disc_mode = BLE_GAP_DISC_MODE_GEN;
    rc = ble_gap_adv_start(BLE_OWN_ADDR_PUBLIC, NULL, BLE_HS_FOREVER, &adv_params, gap_event, NULL);
    if (rc != 0) {
        ESP_LOGE(TAG, "adv_start failed rc=%d", rc);
    }
}

static int gap_event(struct ble_gap_event *event, void *arg)
{
    (void)arg;
    switch (event->type) {
    case BLE_GAP_EVENT_CONNECT:
        if (event->connect.status == 0) {
            s_conn_handle = event->connect.conn_handle;
            ESP_LOGI(TAG, "connected handle=%d", s_conn_handle);
            int mtu_rc = ble_gattc_exchange_mtu(s_conn_handle, NULL, NULL);
            ESP_LOGI(TAG, "MTU exchange requested rc=%d", mtu_rc);
        } else {
            s_conn_handle = BLE_HS_CONN_HANDLE_NONE;
            ble_app_advertise();
        }
        break;
    case BLE_GAP_EVENT_DISCONNECT:
        ESP_LOGI(TAG, "disconnect reason=%d", event->disconnect.reason);
        s_conn_handle = BLE_HS_CONN_HANDLE_NONE;
        ble_app_advertise();
        break;
    case BLE_GAP_EVENT_ADV_COMPLETE:
        ble_app_advertise();
        break;
    case BLE_GAP_EVENT_MTU:
        ESP_LOGI(TAG, "MTU negotiated conn=%d mtu=%d",
                 event->mtu.conn_handle, event->mtu.value);
        break;
    default:
        break;
    }
    return 0;
}

static void on_reset(int reason)
{
    ESP_LOGE(TAG, "nimble reset reason=%d", reason);
}

static void on_sync(void)
{
    int rc = ble_hs_util_ensure_addr(0);
    if (rc != 0) {
        ESP_LOGE(TAG, "ensure_addr rc=%d", rc);
        return;
    }

    uint8_t own_addr_type;
    rc = ble_hs_id_infer_auto(0, &own_addr_type);
    if (rc != 0) {
        ESP_LOGE(TAG, "infer_auto rc=%d", rc);
        return;
    }

    rc = ble_svc_gap_device_name_set(s_device_name);
    if (rc != 0) {
        ESP_LOGE(TAG, "gap_device_name_set rc=%d", rc);
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
    ESP_LOGI(TAG, "QR JSON (scan with app): %s", payload);
    esp_qrcode_config_t cfg = ESP_QRCODE_CONFIG_DEFAULT();
    esp_qrcode_generate(&cfg, payload);
}

static void do_ingest_task(void *arg)
{
    (void)arg;
    char url[160];
    snprintf(url, sizeof url, "%s/api/ingest", CSE123A_API_BASE);

    esp_http_client_config_t cfg = {
        .url = url,
        .method = HTTP_METHOD_POST,
        .timeout_ms = 15000,
        .crt_bundle_attach = esp_crt_bundle_attach,
    };
    esp_http_client_handle_t client = esp_http_client_init(&cfg);
    if (client == NULL) {
        ESP_LOGE(TAG, "esp_http_client_init failed");
        vTaskDelete(NULL);
        return;
    }

    char auth_hdr[160];
    snprintf(auth_hdr, sizeof auth_hdr, "Bearer %s", s_auth_token);
    esp_http_client_set_header(client, "Authorization", auth_hdr);
    esp_http_client_set_header(client, "Content-Type", "application/json");

    char body[192];
    snprintf(body, sizeof body, "{\"device_id\":\"%s\",\"weight_g\":0,\"battery_mv\":0}",
             s_device_id);
    esp_http_client_set_post_field(client, body, strlen(body));

    esp_err_t err = esp_http_client_perform(client);
    if (err == ESP_OK) {
        ESP_LOGI(TAG, "ingest HTTP %d", esp_http_client_get_status_code(client));
    } else {
        ESP_LOGE(TAG, "ingest failed: %s", esp_err_to_name(err));
    }
    esp_http_client_cleanup(client);
    vTaskDelete(NULL);
}

static void wifi_event_handler(void *arg, esp_event_base_t base, int32_t id, void *data)
{
    (void)arg;
    (void)data;
    if (base == WIFI_EVENT && id == WIFI_EVENT_STA_START) {
        ESP_LOGI(TAG, "WIFI_EVENT_STA_START");
    } else if (base == WIFI_EVENT && id == WIFI_EVENT_STA_DISCONNECTED) {
        ESP_LOGW(TAG, "WIFI_EVENT_STA_DISCONNECTED");
        notify_status("wifi_failed");
    } else if (base == IP_EVENT && id == IP_EVENT_STA_GOT_IP) {
        ESP_LOGI(TAG, "got IP");
        notify_status("wifi_connected");

        if (s_auth_token[0] == '\0') {
            ESP_LOGW(TAG, "no auth token; skip ingest");
            return;
        }

        BaseType_t task_ok = xTaskCreate(do_ingest_task, "ingest", 8192, NULL, 5, NULL);
        if (task_ok != pdPASS) {
            ESP_LOGE(TAG, "failed to create ingest task");
        }
    }
}

static void init_wifi_and_ids(void)
{
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_create_default_wifi_sta();

    wifi_init_config_t wcfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&wcfg));
    ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID, wifi_event_handler, NULL));
    ESP_ERROR_CHECK(esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, wifi_event_handler, NULL));
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_start());

    uint8_t mac[6];
    ESP_ERROR_CHECK(esp_wifi_get_mac(WIFI_IF_STA, mac));
    snprintf(s_device_id, sizeof s_device_id, "%02x%02x%02x%02x%02x%02x", mac[0], mac[1], mac[2],
             mac[3], mac[4], mac[5]);
    snprintf(s_device_name, sizeof s_device_name, "ESP32_%02X%02X%02X", mac[3], mac[4], mac[5]);
}

void app_main(void)
{
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK(ret);

    init_wifi_and_ids();

    char stored_ssid[64] = {0};
    char stored_pwd[96]  = {0};
    bool have_stored_prov = prov_load_from_nvs(
        s_auth_token, sizeof s_auth_token,
        stored_ssid,  sizeof stored_ssid,
        stored_pwd,   sizeof stored_pwd);

    if (have_stored_prov) {
        ESP_LOGI(TAG, "found stored provisioning; skipping BLE and connecting Wi-Fi");

        wifi_config_t cfg = {0};
        strncpy((char *)cfg.sta.ssid,     stored_ssid, sizeof cfg.sta.ssid - 1);
        strncpy((char *)cfg.sta.password, stored_pwd,  sizeof cfg.sta.password - 1);
        ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &cfg));

        esp_err_t w = esp_wifi_connect();
        if (w != ESP_OK) {
            ESP_LOGE(TAG, "esp_wifi_connect: %s", esp_err_to_name(w));
        }
        /* wifi_event_handler will run /api/ingest once IP is acquired. */
        return;
    }

    /* No stored creds → run BLE provisioning flow. */
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
}
