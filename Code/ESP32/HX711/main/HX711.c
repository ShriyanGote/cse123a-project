#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <inttypes.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/gpio.h"
#include "esp_rom_sys.h"
#include "esp_log.h"


#define DOUT GPIO_NUM_4//DOUT goes LOW - ready to read, HIGH - In process of converting, see read raw
#define SCK GPIO_NUM_5 // CLK, LOW HIGH LOW -  one clk pulse

#define WEIGHT 1000.0f //CHANGE TO WEIGHT ON LOAD CELL

#define DEBUG 1 //1 is DEBUG ON, 0 is DEBUG off
#define HX711_PULSES_TOTAL 25


static const char *TAG = "HX711";

// Calibration parameters
static int32_t g_offset = 0; // tare offset
static float   g_scale  = 1; // counts per gram


static void sensor_init(void){
    gpio_config_t io = {0};  

    //sck is output
    io.pin_bit_mask = 1ULL << SCK;
    io.mode = GPIO_MODE_OUTPUT;
    io.pull_up_en = GPIO_PULLUP_DISABLE;
    io.pull_down_en = GPIO_PULLDOWN_DISABLE;
    io.intr_type = GPIO_INTR_DISABLE;
    ESP_ERROR_CHECK(gpio_config(&io));

    //out is input
    io.pin_bit_mask = 1ULL << DOUT;
    io.mode = GPIO_MODE_INPUT;
    io.pull_up_en = GPIO_PULLUP_DISABLE;
    io.pull_down_en = GPIO_PULLDOWN_DISABLE;
    io.intr_type = GPIO_INTR_DISABLE;
    ESP_ERROR_CHECK(gpio_config(&io));

    gpio_set_level(SCK, 0);
}

//HX711 is a 24bit readings
static int32_t read_raw(void){
    int32_t value = 0;

    while(gpio_get_level(DOUT) == 1){
        vTaskDelay(pdMS_TO_TICKS(1));
    }

    //24bit read
    for(int i = 0; i < 24; i++){
        gpio_set_level(SCK,1);
        esp_rom_delay_us(1);

        value = (value << 1) | gpio_get_level(DOUT);

        gpio_set_level(SCK, 0);
        esp_rom_delay_us(1);
    }

    if (value & 0x800000) {
        value |= 0xFF000000;
    }

    return (int32_t)value;

}

//Use if noisy
static int32_t read_avg(int samples){
    if(samples <= 0){
        samples = 1;
    }

    int64_t sum = 0;
    for(int i = 0; i < samples; i++){
        sum += read_raw();
        vTaskDelay(pdMS_TO_TICKS(1));
    }
    return (int32_t)(sum/samples);  
}

static void tare(int samples)
{
    g_offset = read_avg(samples);
}


void app_main(void)
{
    sensor_init();
    vTaskDelay(pdMS_TO_TICKS(500)); //CHANGE to whenever powerup correctly
    ESP_LOGI(TAG, "Starting...");
    tare(20);

    #if DEBUG
    while (1) {
        int32_t raw = read_avg(10);
        float units = get_units(10);

        ESP_LOGI(TAG, "raw=%" PRId32 "  units=%.3f", raw, units);

        vTaskDelay(pdMS_TO_TICKS(500));
    }
    #endif
}
