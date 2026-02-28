#pragma once
#include <stdint.h>

void hx711_set_sck(int level);
int  hx711_get_dout(void);
void hx711_delay_us(int us);
void hx711_delay_ms(int ms);