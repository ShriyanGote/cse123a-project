#include <inttypes.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"
#include "https_client.h"
#include "wifi_manager.h"
#include "nvs_flash.h"
#include "esp_sleep.h"

#include "ble.h"
#include "nvs.h"

#include "HX711.h"

#define WIFI_CONNECT_TIMEOUT_MS 15000
#define DEBUG 1

static bool tareDone = false;
static bool notFirstBoot = false;
static int32_t gramBefore = 0;
static bool wifiWasValidated = false;

static const char *TAG = "MAIN";



static void load_state(void)
{
    nvs_handle_t h;
    ESP_ERROR_CHECK(nvs_open("scale", NVS_READWRITE, &h));

    nvs_get_u8(h, "tareDone", (uint8_t *)&tareDone);
    nvs_get_u8(h, "notFirst", (uint8_t *)&notFirstBoot);
    nvs_get_i32(h, "gramBefore", &gramBefore);
    nvs_get_u8(h, "wifiValid", (uint8_t *)&wifiWasValidated);

    int32_t saved_offset = 0;
    if (nvs_get_i32(h, "offset", &saved_offset) == ESP_OK) {
        hx711_set_offset(saved_offset);
    }

    nvs_close(h);
}

static void save_state(void)
{
    nvs_handle_t h;
    ESP_ERROR_CHECK(nvs_open("scale", NVS_READWRITE, &h));

    nvs_set_u8(h, "tareDone", tareDone);
    nvs_set_u8(h, "notFirst", notFirstBoot);
    nvs_set_i32(h, "gramBefore", gramBefore);
    nvs_set_u8(h, "wifiValid", wifiWasValidated);

    nvs_set_i32(h, "offset", hx711_get_offset());
    
    ESP_ERROR_CHECK(nvs_commit(h));
    nvs_close(h);
}

/** POST /api/ingest with Bearer auth (same contract as custom_ble_prov). */
static void post_ingest_grams(int32_t grams)
{
    char device_id[24] = {0};
    char auth_token[96] = {0};
    char body[192];

    wifi_get_device_id_from_mac(device_id, sizeof device_id);
    if (wifi_get_prov_auth_token(auth_token, sizeof auth_token) != ESP_OK || auth_token[0] == '\0') {
        ESP_LOGW(TAG, "No auth token in NVS; skip ingest");
        return;
    }

    snprintf(body, sizeof body, "{\"device_id\":\"%s\",\"weight_g\":%" PRId32 ",\"battery_mv\":0}", device_id,
             grams);

    ESP_LOGI(TAG, "ingest POST: %s", body);
    esp_err_t err = https_post_bearer(CSE123A_INGEST_URL, body, auth_token);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "ingest POST failed: %s", esp_err_to_name(err));
    }
}

static void reboot_to_provisioning(void)
{
    ESP_LOGW(TAG, "Wi-Fi failed; clearing provisioning and rebooting to BLE prov");

    wifi_clear_prov();   // implement this to erase saved SSID/password/token if needed
    save_state();        // optional, only if you want to preserve scale state

    vTaskDelay(pdMS_TO_TICKS(500));
    esp_restart();
}

void app_main(void)
{
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK(ret);

    ESP_ERROR_CHECK(wifi_init());
    load_state();

    if (!prov_credentials_saved()) {
        ESP_LOGI(TAG, "No NVS provisioning; starting BLE (same flow as custom_ble_prov)");
        ESP_ERROR_CHECK(ble_provisioning_init());
        return;
    }

    ESP_LOGI(TAG, "Provisioning found in NVS; connecting Wi-Fi");
    ESP_ERROR_CHECK(wifi_apply_prov_and_connect());
    
    
    if (!wifi_wait_connected_timeout(pdMS_TO_TICKS(WIFI_CONNECT_TIMEOUT_MS))) {
        if (!wifiWasValidated) {
            ESP_LOGW(TAG, "First Wi-Fi validation failed; clearing provisioning");
            reboot_to_provisioning();
        } else {
            ESP_LOGW(TAG, "Wi-Fi already validated before; router may be off. Sleeping/retrying later");

            hx711_power_down();
            esp_sleep_enable_timer_wakeup(15 * 1000000ULL);
            esp_deep_sleep_start();
        }
    }

    if (!wifiWasValidated) {
        ESP_LOGI(TAG, "Wi-Fi validated successfully");

        wifiWasValidated = true;
        save_state();
    }

    sensor_init();
    hx711_power_up();
    vTaskDelay(pdMS_TO_TICKS(500));
    ESP_LOGI(TAG, "Waking Up");
    vTaskDelay(pdMS_TO_TICKS(200));

    if (!tareDone) {
        tare(20);
        tareDone = true;
        save_state();
        ESP_LOGI(TAG, "Tare complete");
    }

    int32_t raw = get_raw_weight(10);
    int32_t grams = get_grams(raw);
    ESP_LOGI(TAG, "grams=%" PRId32 ", gramBefore=%" PRId32, grams, gramBefore);

    if (!notFirstBoot) {
        /* One-time baseline: POST the actual reading so the server has a real weight, not a
         * synthetic zero. After this we only POST when weight moves past the threshold. */
        post_ingest_grams(grams);
        gramBefore = grams;
        notFirstBoot = true;
        save_state();
        ESP_LOGI(TAG, "First Boot Completed");
    } else if ((grams > gramBefore + 15) || (grams < gramBefore - 15)) {
        ESP_LOGI(TAG, "Weight changed; ensure Wi-Fi and POST ingest");
        /* wifi_apply_prov_and_connect() clears WIFI_CONNECTED_BIT; calling it while already
         * associated often does not raise IP_EVENT_STA_GOT_IP again → wifi_wait_connected()
         * blocks forever. Skip reconnect if we already have an IP from boot. */
        if (!wifi_sta_has_ip()) {
            ESP_ERROR_CHECK(wifi_apply_prov_and_connect());
            wifi_wait_connected();
        }

        vTaskDelay(pdMS_TO_TICKS(1000));

        post_ingest_grams(grams);

        gramBefore = (int32_t)grams;
        save_state();
    } else {
        ESP_LOGI(TAG, "No significant change");
    }

    hx711_power_down();
    ESP_LOGI(TAG, "Going to sleep");

    esp_sleep_enable_timer_wakeup(5 * 1000000ULL);
    esp_deep_sleep_start();
}
