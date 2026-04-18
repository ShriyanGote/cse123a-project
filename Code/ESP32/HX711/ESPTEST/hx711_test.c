#include <stdio.h>
#include <math.h>
#include <stdint.h>
#include "../main/HX711.h"

#define TEST_ASSERT(name, cond) \
    do { \
        if (cond) printf("PASS: %s\n", name); \
        else printf("FAIL: %s\n", name); \
    } while (0)

void test_raw_to_grams_zero(void)
{
    int32_t grams = raw_to_grams(830000, 830000, -100.3f);
    TEST_ASSERT("raw_to_grams zero", grams == 0);
}

void test_raw_to_grams_positive(void)
{
    int32_t raw = 830000 - (int32_t)(100.3f * 10.0f);
    int32_t grams = raw_to_grams(raw, 830000, -100.3f);
    TEST_ASSERT("raw_to_grams positive", grams == 10);
}

void test_raw_to_grams_negative(void)
{
    int32_t raw = 830000 + (int32_t)(100.3f * 7.0f);
    int32_t grams = raw_to_grams(raw, 830000, -100.3f);
    TEST_ASSERT("raw_to_grams negative", grams == -7);
}

void test_hx711_raw_change_zero(void)
{
    int32_t change = hx711_raw_change(1000, 1000);
    TEST_ASSERT("hx711_raw_change zero", change == 0);
}

void test_hx711_raw_change_positive(void)
{
    int32_t change = hx711_raw_change(1250, 1000);
    TEST_ASSERT("hx711_raw_change positive", change == 250);
}

void test_hx711_raw_change_negative(void)
{
    int32_t change = hx711_raw_change(875, 1000);
    TEST_ASSERT("hx711_raw_change negative", change == -125);
}

void test_hx711_get_scale(void)
{
    float scale = hx711_get_scale();
    TEST_ASSERT("hx711_get_scale", fabsf(scale - (-100.3f)) < 0.001f);
}

int main(void)
{
    test_raw_to_grams_zero();
    test_raw_to_grams_positive();
    test_raw_to_grams_negative();
    test_hx711_raw_change_zero();
    test_hx711_raw_change_positive();
    test_hx711_raw_change_negative();
    test_hx711_get_scale();
    return 0;
}