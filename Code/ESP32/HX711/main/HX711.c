#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <inttypes.h>

#ifndef UNIT_TEST
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/gpio.h"
#include "esp_rom_sys.h"
#include "esp_log.h"
#include "freertos/portmacro.h"
#endif

#ifdef UNIT_TEST

#define RTC_DATA_ATTR

#define vTaskDelay(x)
#define pdMS_TO_TICKS(x) (x)
#define esp_rom_delay_us(x)
#define ESP_LOGW(tag, msg)
#define ESP_LOGI(tag, fmt, ...)
#define ESP_ERROR_CHECK(x)


typedef int gpio_num_t;

typedef struct {
    unsigned long long pin_bit_mask;
    int mode;
    int pull_up_en;
    int pull_down_en;
    int intr_type;
} gpio_config_t;

#define GPIO_MODE_OUTPUT 1
#define GPIO_MODE_INPUT  0
#define GPIO_PULLUP_DISABLE 0
#define GPIO_PULLDOWN_DISABLE 0
#define GPIO_INTR_DISABLE 0

static inline int gpio_config(const gpio_config_t *io) { (void)io; return 0; }
static inline void gpio_set_level(int pin, int level) { (void)pin; (void)level; }
static inline int gpio_get_level(int pin) { (void)pin; return 0; }

#define GPIO_NUM_4 4
#define GPIO_NUM_5 5

#endif

#include "HX711.h"

#define DOUT GPIO_NUM_4//DOUT goes LOW - ready to read, HIGH - In process of converting, see read raw
#define SCK GPIO_NUM_5 // CLK, LOW HIGH LOW -  one clk pulse

//#define WEIGHT 1000.0f //CHANGE TO WEIGHT ON LOAD CELL

#define DEBUG 1 //1 is DEBUG ON, 0 is DEBUG off

#define HX711_PULSES_TOTAL 25


static const char *TAG = "HX711";

// Calibration parameters
RTC_DATA_ATTR static int32_t g_offset = 0; // tare offset
RTC_DATA_ATTR static float   g_scale  = -100.3f; // counts per gram, will change for calibration

void hx711_power_down(void)
{
    hx711_set_sck(0);
    esp_rom_delay_us(1);
    hx711_set_sck(1);
    esp_rom_delay_us(70); // >60us required
}

void hx711_power_up(void)
{
    hx711_set_sck(0);
    vTaskDelay(pdMS_TO_TICKS(100)); // allow stabilization
}

void sensor_init(void){
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
int32_t read_raw(void){
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
int32_t get_raw_weight(int samples){
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

void tare(int samples){
    g_offset = get_raw_weight(samples);
}

//Raw covert to int grams
int32_t raw_to_grams(int32_t raw, int32_t offset, float scale)
{
    float tempGrams = (raw - offset) / scale;
    if (tempGrams >= 0) {
        tempGrams += 0.5f;
    } else {
        tempGrams -= 0.5f;
    }
    return (int32_t)tempGrams;
}

int32_t get_grams(int32_t raw)
{
    return raw_to_grams(raw, g_offset, g_scale);
}


//RawChange
int32_t hx711_raw_change(int32_t raw, int32_t offset)
{
    return raw - offset;
}

int32_t getRawChange(int32_t raw)
{
    return hx711_raw_change(raw, g_offset);
}

//Offset
int32_t hx711_get_offset(void)
{
    return g_offset;
}

float hx711_get_scale(void)
{
    return g_scale;
}

void hx711_set_offset(int32_t offset)
{
    g_offset = offset;
}

void hx711_set_scale(float scale)
{
    g_scale = scale;
}

//CHECKS DOUT, if BEFORE is HIGH there is problem, most likely wiring
void dout_checker(void)
{
    ESP_LOGI(TAG, "Before pulses: DOUT=%d", hx711_get_dout());
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
