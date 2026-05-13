#pragma once

#include "esp_err.h"

/**
 * @file https_client.h
 * @brief HTTPS client interface for secure HTTP requests
 * 
 * This module provides secure HTTP communication with automatic certificate
 * bundle attachment for SSL/TLS verification. The client automatically handles
 * secure connections to HTTPS endpoints.
 * 
 * @example
 * ```c
 * // Perform a GET request
 * if (https_get("https://api.example.com/data") == ESP_OK) {
 *     ESP_LOGI(TAG, "GET request successful");
 * }
 * 
 * // Perform a POST request with JSON data
 * const char *json_data = "{\"key\": \"value\"}";
 * if (https_post("https://api.example.com/submit", json_data) == ESP_OK) {
 *     ESP_LOGI(TAG, "POST request successful");
 * }
 * ```
 */

/**
 * @brief Perform an HTTPS GET request
 * 
 * Sends an HTTPS GET request to the specified URL. The response status code
 * is logged automatically. Uses the embedded certificate bundle for SSL verification.
 * 
 * @param url The target URL (must start with https://)
 * @return ESP_OK on success, or an esp_err_t error code on failure
 * 
 * @note The function logs the HTTP status code on success and error details on failure
 */
esp_err_t https_get(const char *url);

/**
 * @brief Perform an HTTPS POST request with JSON payload
 * 
 * Sends an HTTPS POST request with JSON data to the specified URL.
 * Automatically sets the Content-Type header to "application/json".
 * The response status code is logged automatically.
 * 
 * @param url The target URL (must start with https://)
 * @param data JSON payload to send (null-terminated string). Can be NULL for empty body.
 * @return ESP_OK on success, or an esp_err_t error code on failure
 * 
 * @note The function logs the HTTP status code on success and error details on failure
 */
esp_err_t https_post(const char *url, const char *data);

/**
 * POST JSON with optional `Authorization: Bearer <bearer_token>`.
 * Pass NULL or "" for bearer_token to omit the header.
 */
esp_err_t https_post_bearer(const char *url, const char *data, const char *bearer_token);