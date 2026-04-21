#include <inttypes.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"
#include "http_utils.h"
#include "wifi_provisioning.h"
#include "nvs_flash.h"
#include "esp_netif.h"
#include "esp_event.h"
#include "esp_sleep.h"

#include "HX711.h"   // your header
#define DEBUG 1 //1 is DEBUG ON, 0 is DEBUG off

/* Run ipconfig in terminal on device that is
*  running test_server.py to find it */

//Save data between boots
RTC_DATA_ATTR static bool tareDone = false;
RTC_DATA_ATTR static bool notFirstBoot = false;
RTC_DATA_ATTR static int32_t gramBefore = 0;

#define TEST_SERVER_IP "10.0.0.46"

static const char *TAG = "MAIN";



void app_main(void)
{
    sensor_init();
    hx711_power_up();
    ESP_LOGI(TAG, "Waking Up");
    vTaskDelay(pdMS_TO_TICKS(200));

    if(!tareDone){
        tare(20);
        tareDone = true;
        ESP_LOGI(TAG, "Tare complete");
    }

    int32_t raw = get_raw_weight(10);
    int32_t grams = get_grams(raw);
    ESP_LOGI(TAG, "grams=%" PRId32 ", gramBefore=%" PRId32, grams, gramBefore);

    if(!notFirstBoot){
        ESP_LOGI(TAG, "First boot");
        gramBefore = grams;
        notFirstBoot = true;
    } else if ((grams > gramBefore + 15) || (grams < gramBefore - 15)) {
            ESP_LOGI(TAG, "Weight changed, connecting Wi-Fi");

            init_wifi();
            connect_to_wifi("ESPTEST", "uc2025sc");
            vTaskDelay(pdMS_TO_TICKS(1000));

            char post_data[64];
            snprintf(post_data, sizeof(post_data), "weight=%" PRId32, grams);
            send_http_post(post_data, TEST_SERVER_IP, "1234", "/api/ingest");

            gramBefore = (int32_t)grams;
        } else{
            ESP_LOGI(TAG, "No significant change");
        }
    
    hx711_power_down();
    ESP_LOGI(TAG, "Going to sleep");

    esp_sleep_enable_timer_wakeup(10 * 1000000ULL);
    esp_deep_sleep_start();
}