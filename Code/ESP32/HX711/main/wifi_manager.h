#pragma once
#include <stdbool.h>
#include "esp_err.h"

/**
 * @file wifi_manager.h
 * @brief WiFi connection management interface
 * 
 * This module provides functions to initialize WiFi and manage connections.
 * 
 * @example
 * ```c
 * wifi_init();
 * wifi_connect("wifi name", "password123");
 * wifi_wait_connected();
 * ```
 */

/**
 * @brief Initialize WiFi subsystem
 * 
 * Sets up the WiFi event loop, network interface, and event handlers.
 * This must be called before attempting to connect.
 * 
 * @return ESP_OK on success, or error code on failure
 */
esp_err_t wifi_init(void);

/**
 * @brief Connect to a WiFi network
 * 
 * Configures WiFi credentials and initiates connection to the specified network.
 * Connection progress can be monitored via wifi_wait_connected().
 * 
 * @param ssid WiFi network SSID (null-terminated string)
 * @param password WiFi network password (null-terminated string)
 * @return ESP_OK on success, or error code on failure
 */
esp_err_t wifi_connect(const char *ssid, const char *password);

/**
 * @brief Block until WiFi connection is established
 * 
 * Blocks the calling thread until the device successfully connects to the WiFi network.
 * Should be called after wifi_connect() to wait for the connection to complete.
 * 
 * @return void
 */
void wifi_wait_connected(void);

bool wifi_credentials_saved(void);
esp_err_t wifi_connect_saved(void);