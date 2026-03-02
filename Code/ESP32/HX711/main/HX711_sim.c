#include "HX711.h"
#include <stdlib.h>
#include <time.h>

static float current_weight = 0.0f;
static int32_t offset = 830000;         //change to dynamic when we have a tested and confirmed offset
static float scale = -100.3f;

static int bit_index = 0;
static int32_t current_sample = 0;

void sim_set_weigth(float grams) {
    current_weight = grams;

    float noise = ((rand() % 100) - 50) * 0.5f; //inconsistency and noise to simulate things like bad placement 
    float total = grams + noise;

    current_sample = offset + (int32_t)(total * scale);
    bit_index = 0;
}

void hhx711_set_sck(int level) {
    if (level == 1) {
        bit_index++;
    }
}

int hx711_get_dout(void) {
    if (bit_index < 24) {
        return (current_sample >> (23 - bit_index)) & 1;
    }
    return 0;
}

void hx711_delay_us(int us) {}
void hx711_delay_ms(int ms) {}
