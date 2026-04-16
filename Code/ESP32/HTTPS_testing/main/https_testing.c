#include <string.h>
#include "esp_log.h"
#include "nvs_flash.h"
#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_netif.h"
#include "esp_http_client.h"
#include "esp_crt_bundle.h"

static const char *TAG = "HTTPS_WIFI";

/* ====== WIFI CONFIG ====== */
#define WIFI_SSID "Reid's iPhone 17"
#define WIFI_PASS "fortnite67"

static void wifi_init_and_connect(void)
{
    ESP_ERROR_CHECK(nvs_flash_init());
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());

    esp_netif_create_default_wifi_sta();

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));

    wifi_config_t wifi_config = {
        .sta = {
            .ssid = WIFI_SSID,
            .password = WIFI_PASS,
        },
    };

    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_config));
    ESP_ERROR_CHECK(esp_wifi_start());

    ESP_ERROR_CHECK(esp_wifi_connect());

    ESP_LOGI(TAG, "WiFi connecting...");
}

/* ====== APP MAIN ====== */
void app_main(void)
{
    wifi_init_and_connect();

    vTaskDelay(pdMS_TO_TICKS(5000)); // simple wait for IP (minimal test approach)

    esp_http_client_config_t config = {
        .url = "https://httpbin.org/get",
        .crt_bundle_attach = esp_crt_bundle_attach,
    };

    esp_http_client_handle_t client = esp_http_client_init(&config);

    ESP_LOGI(TAG, "Making HTTPS GET...");
    esp_err_t err = esp_http_client_perform(client);

    if (err == ESP_OK) {
        ESP_LOGI(TAG, "Status = %d",
                 esp_http_client_get_status_code(client));
    } else {
        ESP_LOGE(TAG, "Request failed: %s", esp_err_to_name(err));
    }

    esp_http_client_cleanup(client);
}