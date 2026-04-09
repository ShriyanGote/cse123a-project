#include <stdio.h>
#include <string.h>
#include <stdlib.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include "esp_log.h"
#include "nvs_flash.h"
#include "esp_netif.h"
#include "esp_event.h"
#include "esp_wifi.h"

#include "http_client.h"   // <-- your file with send_http_get/post

static const char *TAG = "APP_MAIN";

/* =========================
   WIFI CONNECT (simple STA)
   ========================= */

#define WIFI_SSID "YOUR_WIFI"
#define WIFI_PASS "YOUR_PASS"

static void wifi_init(void)
{
    esp_netif_init();
    esp_event_loop_create_default();
    esp_netif_create_default_wifi_sta();

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    esp_wifi_init(&cfg);

    wifi_config_t wifi_config = {
        .sta = {
            .ssid = WIFI_SSID,
            .password = WIFI_PASS,
        },
    };

    esp_wifi_set_mode(WIFI_MODE_STA);
    esp_wifi_set_config(WIFI_IF_STA, &wifi_config);
    esp_wifi_start();

    esp_wifi_connect();

    ESP_LOGI(TAG, "WiFi connecting...");
}

/* =========================
   APP MAIN
   ========================= */

void app_main(void)
{
    ESP_ERROR_CHECK(nvs_flash_init());

    wifi_init();

    // Give WiFi time to connect (simple blocking wait)
    vTaskDelay(pdMS_TO_TICKS(5000));

    ESP_LOGI(TAG, "Starting HTTPS test...");

    /* =========================
       TEST GET
       ========================= */

    char *get_resp = send_http_get("https://httpbin.org/get");

    if (get_resp) {
        ESP_LOGI(TAG, "GET RESPONSE:\n%s", get_resp);
        free(get_resp);
    } else {
        ESP_LOGE(TAG, "GET failed");
    }

    vTaskDelay(pdMS_TO_TICKS(2000));

    /* =========================
       TEST POST
       ========================= */

    char *post_resp = send_http_post(
        "https://httpbin.org/post",
        "hello from esp32"
    );

    if (post_resp) {
        ESP_LOGI(TAG, "POST RESPONSE:\n%s", post_resp);
        free(post_resp);
    } else {
        ESP_LOGE(TAG, "POST failed");
    }

    ESP_LOGI(TAG, "Done.");
}