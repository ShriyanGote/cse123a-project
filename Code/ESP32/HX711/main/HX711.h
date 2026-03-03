#pragma once
#include <stdint.h>

int32_t get_raw_weight(int samples);
float get_grams(int32_t raw);
void tare(int samples);
int32_t read_raw(void);

void hx711_set_sck(int level);
int  hx711_get_dout(void);
void hx711_delay_us(int us);
void hx711_delay_ms(int ms);

void sim_set_weight(float grams);