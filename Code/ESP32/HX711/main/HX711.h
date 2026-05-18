#pragma once
#include <stdint.h>

void sensor_init(void);
int32_t get_raw_weight(int samples);

void tare(int samples);

int32_t read_raw(void);
void dout_checker(void);


void hx711_set_sck(int level);
int  hx711_get_dout(void);
void hx711_delay_us(int us);
void hx711_delay_ms(int ms);

void sim_set_weight(float grams);

void hx711_power_down(void);
void hx711_power_up(void);

int32_t get_grams(int32_t raw);
int32_t getRawChange(int32_t raw);

int32_t raw_to_grams(int32_t raw, int32_t offset, float scale);
int32_t hx711_raw_change(int32_t raw, int32_t offset);

int32_t hx711_get_offset(void);
float hx711_get_scale(void);

void hx711_set_offset(int32_t offset);
void hx711_set_scale(float scale);