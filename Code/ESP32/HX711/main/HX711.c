#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <inttypes.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/gpio.h"
#include "esp_rom_sys.h"
#include "esp_log.h"
#include "freertos/portmacro.h"

#include "HX711.h"

#define DOUT GPIO_NUM_4//DOUT goes LOW - ready to read, HIGH - In process of converting, see read raw
#define SCK GPIO_NUM_5 // CLK, LOW HIGH LOW -  one clk pulse

//#define WEIGHT 1000.0f //CHANGE TO WEIGHT ON LOAD CELL

#define DEBUG 1 //1 is DEBUG ON, 0 is DEBUG off

#define HX711_PULSES_TOTAL 25


static const char *TAG = "HX711";

// Calibration parameters
static int32_t g_offset = 0; // tare offset
static float   g_scale  = -100.3f; // counts per gram, will change for calibration


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

    hx711_set_sck(0);
}

//HX711 is a 24bit readings
static int32_t read_raw(void){
    int32_t value = 0;

    //debug HX711 Not ready if stuck 0
    #if DEBUG
    int waited = 0;
    while (hx711_get_dout() == 1) {
        vTaskDelay(pdMS_TO_TICKS(20));
        waited += 20;
        if (waited >= 1000) { // 1 second
            ESP_LOGW(TAG, "HX711 not ready (DOUT stayed high)");
            return 0;
        }
    }
    #endif

    //24bit read
    for(int i = 0; i < HX711_PULSES_TOTAL; i++){
        hx711_set_sck(1);
        esp_rom_delay_us(1);

        if(i < 24){
            value = (value << 1) | (hx711_get_dout() & 0x1);
        }
        hx711_set_sck(0);
        esp_rom_delay_us(2);
    }

    if (value & 0x800000) { value |= 0xFF000000; }
    return (int32_t)value;
}

//HELPER METHODS, GetMethods
//Averages the samples, return the raw weight as an average to reduce noise
static int32_t get_raw_weight(int samples){
    if(samples <= 0){
        samples = 1;
    }

    int64_t sum = 0;
    for(int i = 0; i < samples; i++){
        sum += read_raw();
        vTaskDelay(pdMS_TO_TICKS(20));
    }
    return (int32_t)(sum/samples);  
}

static void tare(int samples){
    g_offset = get_raw_weight(samples);
}

static float get_grams(int32_t raw){
    return (raw - g_offset) / g_scale;
}

static int32_t getRawChange(int rawWeight){
    return rawWeight - g_offset;
}

//CHECKS DOUT, if BEFORE is HIGH there is problem, most likely wiring
static void dout_checker(void)
{
    ESP_LOGI(TAG, "Before pulses: DOUT=%d", hx711_get_dout();
    // Send 25 pulses (select A gain 128)
    for (int i = 0; i < 25; i++) {
        hx711_set_sck(1);
        esp_rom_delay_us(2);
        hx711_set_sck(0);
        esp_rom_delay_us(2);
    }
    // HX711 should now start a conversion -> DOUT should go HIGH (usually)
    esp_rom_delay_us(10);
    ESP_LOGI(TAG, "After pulses:  DOUT=%d", hx711_get_dout());
}

void hx711_set_sck(int level) {
    gpio_set_level(SCK, level);
}

int hx711_get_dout(void) {
    return gpio_get_level(DOUT);
}

void hx711_delay_us(int us) {
    esp_rom_delay_us(us);
}

void hx711_delay_ms(int ms) {
    vTaskDelay(pdMS_TO_TICKS(ms));
}

void app_main(void)
{
    sensor_init();
    vTaskDelay(pdMS_TO_TICKS(500)); //CHANGE to whenever powerup correctly

    #if DEBUG
        dout_checker();
    #endif

    ESP_LOGI(TAG, "Starting setup, please wait.");
    tare(20);
    ESP_LOGI(TAG, "Tare offset=%" PRId32, g_offset);

    vTaskDelay(pdMS_TO_TICKS(100)); //additional wait, subject to change

    #if DEBUG
    while (1) {
    int32_t raw = get_raw_weight(10);           // ADC value from HX711
    ESP_LOGI(TAG,
             "raw=%" PRId32
             "  offset=%" PRId32
             "  rawChange=%" PRId32
             "  grams=%.3f g",
             raw, g_offset, getRawChange(raw), get_grams(raw));

    vTaskDelay(pdMS_TO_TICKS(500));
    }
    #endif
}