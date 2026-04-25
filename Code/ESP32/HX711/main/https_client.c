/**
 * @file https_client.c
 * @brief HTTPS client for making secure HTTP requests
 * 
 * This module provides HTTPS GET and POST functionality for the ESP32,
 * with automatic certificate bundle handling for SSL/TLS verification.
 */

#include <string.h>
#include "https_client.h"

#include "esp_log.h"
#include "esp_http_client.h"
#include "esp_crt_bundle.h"

static const char *TAG = "HTTPS";

/**
 * @brief Performs an HTTPS GET request
 * @param url Target URL for the GET request
 * @return ESP_OK on success, or error code on failure
 */
esp_err_t https_get(const char *url)
{
    esp_http_client_config_t config = {
        .url = url,
        .crt_bundle_attach = esp_crt_bundle_attach,
    };

    esp_http_client_handle_t client = esp_http_client_init(&config);

    ESP_LOGI(TAG, "GET %s", url);

    esp_err_t err = esp_http_client_perform(client);

    if (err == ESP_OK) {
        ESP_LOGI(TAG, "Status = %d",
                 esp_http_client_get_status_code(client));
    } else {
        ESP_LOGE(TAG, "GET failed: %s", esp_err_to_name(err));
    }

    esp_http_client_cleanup(client);
    return err;
}

/**
 * @brief Performs an HTTPS POST request with JSON data
 * @param url Target URL for the POST request
 * @param data JSON payload to send (NULL-terminated string)
 * @return ESP_OK on success, or error code on failure
 */
esp_err_t https_post(const char *url, const char *data)
{
    esp_http_client_config_t config = {
        .url = url,
        .crt_bundle_attach = esp_crt_bundle_attach,
    };

    esp_http_client_handle_t client = esp_http_client_init(&config);

    esp_http_client_set_method(client, HTTP_METHOD_POST);
    esp_http_client_set_header(client, "Content-Type", "application/json");

    if (data) {
        esp_http_client_set_post_field(client, data, strlen(data));
    }

    ESP_LOGI(TAG, "POST %s", url);

    esp_err_t err = esp_http_client_perform(client);

    if (err == ESP_OK) {
        ESP_LOGI(TAG, "Status = %d",
                 esp_http_client_get_status_code(client));
    } else {
        ESP_LOGE(TAG, "POST failed: %s", esp_err_to_name(err));
    }

    esp_http_client_cleanup(client);
    return err;
}