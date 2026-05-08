#include <inttypes.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"
#include "https_client.h"
#include "wifi_manager.h"
#include "nvs_flash.h"
#include "esp_netif.h"
#include "esp_event.h"
#include "esp_sleep.h"

#include "ble.h"
#include "nvs_flash.h"
#include "nvs.h"


#include "HX711.h"   // your header
#define DEBUG 1 //1 is DEBUG ON, 0 is DEBUG off

/* Run ipconfig in terminal on device that is
*  running test_server.py to find it */

//Save data between boots
static bool tareDone = false;
static bool notFirstBoot = false;
static int32_t gramBefore = 0;

#define TEST_SERVER_URL "https://httpbin.org/post"

static const char *TAG = "MAIN";

static void load_state(void)
{
    nvs_handle_t h;
    ESP_ERROR_CHECK(nvs_open("scale", NVS_READWRITE, &h));

    nvs_get_u8(h, "tareDone", (uint8_t *)&tareDone);
    nvs_get_u8(h, "notFirst", (uint8_t *)&notFirstBoot);
    nvs_get_i32(h, "gramBefore", &gramBefore);

    nvs_close(h);
}

static void save_state(void)
{
    nvs_handle_t h;
    ESP_ERROR_CHECK(nvs_open("scale", NVS_READWRITE, &h));

    nvs_set_u8(h, "tareDone", tareDone);
    nvs_set_u8(h, "notFirst", notFirstBoot);
    nvs_set_i32(h, "gramBefore", gramBefore);

    ESP_ERROR_CHECK(nvs_commit(h));
    nvs_close(h);
}


void app_main(void)
{   
    ESP_ERROR_CHECK(ble_provisioning_init());
    //ESP_ERROR_CHECK(nvs_flash_init());
    load_state();
    sensor_init();
    hx711_power_up();
    vTaskDelay(pdMS_TO_TICKS(500));
    ESP_LOGI(TAG, "Waking Up");
    vTaskDelay(pdMS_TO_TICKS(200));

    if(!tareDone){
        tare(20);
        tareDone = true;
        save_state();
        ESP_LOGI(TAG, "Tare complete");
    }

    int32_t raw = get_raw_weight(10);
    int32_t grams = get_grams(raw);
    ESP_LOGI(TAG, "grams=%" PRId32 ", gramBefore=%" PRId32, grams, gramBefore);

    if(!notFirstBoot){
        gramBefore = grams;
        notFirstBoot = true;
        save_state();
        ESP_LOGI(TAG, "First Boot Completed");
    } else if ((grams > gramBefore + 15) || (grams < gramBefore - 15)) {
            ESP_LOGI(TAG, "Weight changed, connecting Wi-Fi");
            wifi_init();
        
            wifi_connect("ESPTEST", "uc2025sc");
            wifi_wait_connected(); //check
            
            vTaskDelay(pdMS_TO_TICKS(1000));

            char post_data[64];
            snprintf(post_data, sizeof(post_data), "weight=%" PRId32, grams);
            ESP_LOGI(TAG, "POST DATA: %s", post_data);
            esp_err_t err = https_post(TEST_SERVER_URL, post_data);
            if(err != ESP_OK){
                ESP_LOGE(TAG, "HTTP POST FAILED: %s", esp_err_to_name(err));
            }

            gramBefore = (int32_t)grams;
            save_state();
        } else{
            ESP_LOGI(TAG, "No significant change");
        }
    
    hx711_power_down();
    ESP_LOGI(TAG, "Going to sleep");

    esp_sleep_enable_timer_wakeup(10 * 1000000ULL);
    esp_deep_sleep_start();
}