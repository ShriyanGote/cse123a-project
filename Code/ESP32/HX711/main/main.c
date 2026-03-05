#include <inttypes.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"

#include "HX711.h"   // your header
#define DEBUG 1 //1 is DEBUG ON, 0 is DEBUG off

static const char *TAG = "MAIN";

void app_main(void)
{
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
        ESP_LOGI(TAG,
                 "raw=%" PRId32
                 "  offset=%" PRId32
                 "  rawChange=%" PRId32
                 "  grams=%.3f g",
                 raw, offset, getRawChange(raw), get_grams(raw));

        vTaskDelay(pdMS_TO_TICKS(500));
    }
#endif
}