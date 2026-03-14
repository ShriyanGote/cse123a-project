#include <inttypes.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"
#include "http_utils.h"
#include "wifi_provisioning.h"
#include "nvs_flash.h"
#include "esp_netif.h"
#include "esp_event.h"

#include "HX711.h"   // your header
#define DEBUG 1 //1 is DEBUG ON, 0 is DEBUG off

/* Run ipconfig in terminal on device that is
*  running test_server.py to find it */
#define TEST_SERVER_IP "172.20.10.7"

static const char *TAG = "MAIN";



void app_main(void)
{
    init_wifi();
    connect_to_wifi("ESPTEST", "uc2025sc");
    vTaskDelay(1000 / portTICK_PERIOD_MS); // wait for connection


    sensor_init();
    vTaskDelay(pdMS_TO_TICKS(500));

#if DEBUG
    dout_checker();   // optional
#endif

    ESP_LOGI(TAG, "Starting setup, please wait.");
    tare(20);
    int32_t offset = hx711_get_offset();
    ESP_LOGI(TAG, "Tare offset=%" PRId32, offset);

    vTaskDelay(pdMS_TO_TICKS(100));

#if DEBUG
    while (1) {
        int32_t raw = get_raw_weight(10);
        float grams = get_grams(raw);
        int32_t rawChange = getRawChange(raw);

        ESP_LOGI(TAG,
                 "raw=%" PRId32
                 "  offset=%" PRId32
                 "  rawChange=%" PRId32
                 "  grams=%.3f g",
                 raw, offset, rawChange, grams);
        
        char post_data[64];
        snprintf(post_data, sizeof(post_data), "weight=%.2f", grams);

        send_http_post(post_data, TEST_SERVER_IP, "1234", "/api/ingest");
        vTaskDelay(pdMS_TO_TICKS(500));
    }
#endif
}