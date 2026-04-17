#include "wifi_manager.h"
#include "https_client.h"

void app_main(void)
{
    wifi_init();
    wifi_connect("Reid's iPhone 17", "fortnite67");
    wifi_wait_connected();

    https_get("https://httpbin.org/get");

    https_post("https://httpbin.org/post",
               "{\"msg\":\"hello from esp32\"}");
}