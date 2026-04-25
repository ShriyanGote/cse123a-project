#pragma once

#ifndef ESP_SETUP_SOFTAP_HTTP_H
#define ESP_SETUP_SOFTAP_HTTP_H

#include <stdio.h>
#include <string.h>
#include <stdbool.h>
#include <ctype.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include "esp_mac.h"
#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_log.h"
#include "esp_system.h"
#include "nvs_flash.h"
#include "nvs.h"

#include "lwip/err.h"
#include "lwip/sys.h"

#include "esp_netif.h"
#include "esp_http_server.h"
#include "http_utils.h"

//-----------------------Config-----------------------------
#define WIFI_SSID "Smart Filter Setup"
//----------------------------------------------------------

/*
    * @brief Initialize Wi-Fi in SoftAP mode and start the HTTP server for provisioning.
    * 
    * This function attempts to connect to a previously saved Wi-Fi network using credentials
    * stored in NVS. If no credentials are found, it starts a Wi-Fi SoftAP with the SSID
    * "Smart Filter Setup" and launches an HTTP server. The HTTP server serves a simple webpage 
    * where users can enter their Wi-Fi credentials (SSID and password).
    * When the user submits the form, the credentials are received by the ESP32, decoded, and
    * printed to the log. The credentials can then be saved to NVS for future use.
    * 
    * CURRENTLY NOT FINISHED
*/
void init_wifi();

//-----------------------SoftAP-----------------------------
    //all static functions (private)
//----------------------------------------------------------

//-----------------------HTTP------------------------------
void url_decode(char *dst, const char *src);
void parse_http_credentials_data(const char *data, char *ssid, char *pass);
//----------------------------------------------------------

//-----------------------WiFi------------------------------
void connect_to_wifi(const char *ssid, const char *pass);
void save_wifi_credentials(const char *ssid, const char *pass);
bool load_wifi_credentials(char *ssid, char *pass);
//----------------------------------------------------------

#endif // ESP_SETUP_SOFTAP_HTTP_H