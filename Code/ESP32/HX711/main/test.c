#include <stdio.h>
#include <stdlib.h>
#include <math.h>
#include "HX711.h"

#define SMALL_WEIGHT 100.0f
#define LARGE_WEGITH 10000.0f
#define TOLERANCE 5.0f
#define TESTS 500
#define HX711_PULSES_TOTAL 25

#define DEBUG 0

// Calibration parameters
static float current_weight = 0.0f;
static int32_t g_offset = 830000;         //change to dynamic when we have a tested and confirmed offset
static float scale = -100.3f;

static int bit_index = 0;
static int32_t current_sample = 0;

static int32_t offset = 0;  //tare offset

void sim_set_weight(float grams) {
    current_weight = grams;
}

void hx711_set_sck(int level) {
    if (level == 1) {
        bit_index++;
    }
}

int hx711_get_dout(void) {
    if (bit_index < 24) {
        return (current_sample >> (24 - bit_index)) & 1;
    }
    return 0;
}

//HX711 is a 24bit readings
int32_t read_raw(void){
    // Generate new noisy sample every read
    float noise = ((rand() / (float)RAND_MAX) * 2.0f - 1.0f) * 1.0f;
    float total = current_weight + noise;

    current_sample = g_offset + (int32_t)(total * scale);

    int32_t value = 0;
    bit_index = 0;

    for(int i = 0; i < HX711_PULSES_TOTAL; i++){
        hx711_set_sck(1);

        if(i < 24){
            value = (value << 1) | (hx711_get_dout() & 0x1);
        }

        hx711_set_sck(0);
    }

    if (value & 0x800000) {
        value |= 0xFF000000;
    }

    return value;
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
    }
    return (int32_t)(sum/samples);  
}

void tare(int samples){
    offset = get_raw_weight(samples);
}

float get_grams(int32_t raw){
    return (raw - offset) / scale;
}

int32_t getRawChange(int rawWeight){
    return rawWeight - offset;
}

//CHECKS DOUT, if BEFORE is HIGH there is problem, most likely wiring
void dout_checker(void)
{
    // Send 25 pulses (select A gain 128)
    for (int i = 0; i < 25; i++) {
        hx711_set_sck(1);
        hx711_set_sck(0);
    }
}

void hx711_delay_us(int us) {}
void hx711_delay_ms(int ms) {}


int main(void) {
    srand(0);

    sim_set_weight(0.0f);

    tare(10);

    for (int i = 0; i < TESTS; i++) {
        float expected;

        int r = rand() % 3;

        if (r == 0) expected = 0;
        else if (r == 1) expected = SMALL_WEIGHT;
        else expected = LARGE_WEGITH;

        sim_set_weight(expected);

        int32_t raw = get_raw_weight(10);
        float measured = get_grams(raw);

        float error = fabs(measured - expected);
        
        if (error > TOLERANCE) {
            printf("FAIL: Expected %.2f. Measured %.2f. Error %.2f\n", expected, measured, error);
        } else {
            printf("PASS: Expected %.2f. Measured %.2f\n", expected, measured);
        }
    }
    printf("\nTests Complete\n");
    return 0;
}