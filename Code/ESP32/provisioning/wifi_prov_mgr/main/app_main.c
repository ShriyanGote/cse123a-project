#include <stdio.h>
#include <string.h>

#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <freertos/event_groups.h>

#include <esp_log.h>
#include <esp_wifi.h>
#include <esp_event.h>
#include <nvs_flash.h>

#include <wifi_provisioning/manager.h>
#include <wifi_provisioning/scheme_ble.h>

#include "qrcode.h"

/* =========================
 * USER CONFIG (NO MENUCONFIG)
 * ========================= */

#define PROV_SECURITY_MODE     1
// 0 = no security
// 1 = security 1 (X25519 + PoP)

#define PROV_POP              "abcd1234" //for security1, should be unique per device 
#define PROV_RETRY_ATTEMPTS    5 // Number of times to retry WiFi connection before giving up
#define PROV_RESET_ON_BOOT     1 // Set to 1 to reset provisioning data on every boot (for testing)
#define PROV_SHOW_QR           1 
static const char *TAG = "app";

/////////for async listeners
#define WIFI_CONNECTED_BIT     BIT0


/* =========================
 * GLOBAL STATE
 * ========================= */

static EventGroupHandle_t wifi_event_group;
static int wifi_retry_count = 0;

/* =========================
 * QR CODE (SIMPLIFIED)
 * ========================= */

static void wifi_prov_print_qr(const char *name, const char *pop)
{
    char payload[150];

    snprintf(payload, sizeof(payload),
             "{\"ver\":\"v1\",\"name\":\"%s\",\"pop\":\"%s\",\"transport\":\"ble\"}",
             name,
             pop ? pop : "");

#if PROV_SHOW_QR
    esp_qrcode_config_t cfg = ESP_QRCODE_CONFIG_DEFAULT();
    esp_qrcode_generate(&cfg, payload);
#endif

    ESP_LOGI(TAG, "Provisioning payload: %s", payload);
}

/* =========================
 * DEVICE NAME
 * ========================= */

static void get_device_service_name(char *service_name, size_t max)
{
    uint8_t mac[6];
    esp_wifi_get_mac(WIFI_IF_STA, mac);

    snprintf(service_name, max,
             "PROV_%02X%02X%02X",
             mac[3], mac[4], mac[5]);
}

/* =========================
 * WIFI EVENT HANDLER
 * ========================= */

static void event_handler(void *arg,
                          esp_event_base_t event_base,
                          int32_t event_id,
                          void *event_data)
{
    if (event_base == WIFI_EVENT) {

        if (event_id == WIFI_EVENT_STA_START) {
            esp_wifi_connect();
        }

        if (event_id == WIFI_EVENT_STA_DISCONNECTED) {

            ESP_LOGI(TAG, "WiFi disconnected");

            if (wifi_retry_count < PROV_RETRY_ATTEMPTS) {
                wifi_retry_count++;
                ESP_LOGI(TAG, "Retry %d/%d",
                         wifi_retry_count,
                         PROV_RETRY_ATTEMPTS);
                esp_wifi_connect();
            } else {
                ESP_LOGE(TAG, "Max retries reached");
            }
        }
    }

    if (event_base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP) {
        ESP_LOGI(TAG, "WiFi connected");

        wifi_retry_count = 0;

        xEventGroupSetBits(wifi_event_group, WIFI_CONNECTED_BIT);
    }
}

/* =========================
 * WIFI INIT
 * ========================= */

static void wifi_init_sta(void)
{
    esp_wifi_set_mode(WIFI_MODE_STA);
    esp_wifi_start();
}

/* =========================
 * APP MAIN
 * ========================= */

void app_main(void)
{
    /* NVS */
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES ||
        ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        nvs_flash_erase();
        nvs_flash_init();
    }

    esp_netif_init();
    esp_event_loop_create_default();

    wifi_event_group = xEventGroupCreate();

    esp_netif_create_default_wifi_sta();

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    esp_wifi_init(&cfg);

    esp_event_handler_register(WIFI_EVENT,
                               ESP_EVENT_ANY_ID,
                               &event_handler,
                               NULL);

    esp_event_handler_register(IP_EVENT,
                               IP_EVENT_STA_GOT_IP,
                               &event_handler,
                               NULL);

    /* Optional reset stored credentials */
#if PROV_RESET_ON_BOOT
    ESP_LOGW(TAG, "Resetting WiFi provisioning data");
    wifi_prov_mgr_reset_provisioning();
#endif

    /* Provisioning config (BLE ONLY) */
    wifi_prov_mgr_config_t prov_config = {
        .scheme = wifi_prov_scheme_ble,
        .scheme_event_handler =
            WIFI_PROV_SCHEME_BLE_EVENT_HANDLER_FREE_BTDM
    };

    wifi_prov_mgr_init(prov_config);

    bool provisioned = false;
    wifi_prov_mgr_is_provisioned(&provisioned);

    if (!provisioned) {

        ESP_LOGI(TAG, "Starting provisioning");

        char service_name[32];
        get_device_service_name(service_name, sizeof(service_name));

        /* =========================
         * SECURITY SELECTION
         * ========================= */

#if PROV_SECURITY_MODE == 0

        wifi_prov_security_t security = WIFI_PROV_SECURITY_0;
        const void *sec_params = NULL;

#elif PROV_SECURITY_MODE == 1

        wifi_prov_security_t security = WIFI_PROV_SECURITY_1;

        const char *pop = PROV_POP;

        wifi_prov_security1_params_t *sec_params =
            (wifi_prov_security1_params_t *) pop;

#else
#error "Invalid PROV_SECURITY_MODE"
#endif

        const char *service_key = NULL;

        /* Start provisioning */
        wifi_prov_mgr_start_provisioning(
            security,
            sec_params,
            service_name,
            service_key
        );

        /* QR code (optional) */
        wifi_prov_print_qr(service_name, PROV_POP);

    } else {

        ESP_LOGI(TAG, "Already provisioned");

        wifi_prov_mgr_deinit();
        wifi_init_sta();
    }

    /* Wait for WiFi */
    xEventGroupWaitBits(
        wifi_event_group,
        WIFI_CONNECTED_BIT,
        true,
        true,
        portMAX_DELAY
    );

    /* Main loop */
    while (1) {
        ESP_LOGI(TAG, "Hello World");
        vTaskDelay(1000 / portTICK_PERIOD_MS);
    }
}