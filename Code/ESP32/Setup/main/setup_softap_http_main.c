#include <stdio.h>
#include <string.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_mac.h"
#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_log.h"
#include "nvs_flash.h"

#include "lwip/err.h"
#include "lwip/sys.h"

//http
#include "esp_netif.h"
#include "esp_event.h"
#include "esp_http_server.h"


//-----------------------Config-----------------------------
//WIFI SSID
#define WIFI_SSID "r esp wifi test"

static const char *TAG = "esp_setup_softap_http";
//----------------------------------------------------------




//+++++++++++++++++++++++++WiFi+++++++++++++++++++++++++++++
static void wifi_event_handler(void* arg, esp_event_base_t event_base,
                                    int32_t event_id, void* event_data)
{
    if (event_id == WIFI_EVENT_AP_STACONNECTED) {
        wifi_event_ap_staconnected_t* event = (wifi_event_ap_staconnected_t*) event_data;
        ESP_LOGI(TAG, "station "MACSTR" join, AID=%d",
                 MAC2STR(event->mac), event->aid);
    } else if (event_id == WIFI_EVENT_AP_STADISCONNECTED) {
        wifi_event_ap_stadisconnected_t* event = (wifi_event_ap_stadisconnected_t*) event_data;
        ESP_LOGI(TAG, "station "MACSTR" leave, AID=%d, reason=%d",
                 MAC2STR(event->mac), event->aid, event->reason);
    }
}

static void wifi_init_softap(void)
{
    /* Initialize TCP/IP stack */
    ESP_ERROR_CHECK(esp_netif_init());

    /* Create default event loop */
    ESP_ERROR_CHECK(esp_event_loop_create_default());

    /* Create default Wi-Fi AP */
    esp_netif_create_default_wifi_ap();

    /* Initialize Wi-Fi */
    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));

    /* Register Wi-Fi events (optional but recommended) */
    ESP_ERROR_CHECK(esp_event_handler_instance_register(
        WIFI_EVENT,
        ESP_EVENT_ANY_ID,
        &wifi_event_handler,
        NULL,
        NULL));

    /* Configure SoftAP */
    wifi_config_t wifi_config = {
        .ap = {
            .ssid = WIFI_SSID,
            .ssid_len = 0,                 // auto-calc
            .channel = 1,
            .password = "",                // empty = open network
            .max_connection = 1,
            .authmode = WIFI_AUTH_OPEN
        },
    };

    /* Set Wi-Fi mode to AP */
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_APSTA));

    /* Apply configuration */
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_AP, &wifi_config));

    /* Start Wi-Fi */
    ESP_ERROR_CHECK(esp_wifi_start());

    ESP_LOGI(TAG, "SoftAP started");
    ESP_LOGI(TAG, "SSID: Device-Setup");
    ESP_LOGI(TAG, "IP: http://192.168.4.1");
}
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++




//------------------------HTTP------------------------------
/* Simple GET handler for "/" */
static esp_err_t root_get_handler(httpd_req_t *req)
{
    const char* html =
        "<!DOCTYPE html>"
        "<html>"
        "<head><title>ESP32 Setup</title></head>"
        "<body>"
        "<h1>ESP32 Provisioning</h1>"
        "<p>Connect your WiFi!</p>"
        "</body>"
        "</html>";

    httpd_resp_set_type(req, "text/html");
    httpd_resp_send(req, html, HTTPD_RESP_USE_STRLEN);
    return ESP_OK;
}

/* URI registration */
static httpd_uri_t root = {
    .uri       = "/",
    .method    = HTTP_GET,
    .handler   = root_get_handler,
    .user_ctx  = NULL
};

/* Start the HTTP server */
static httpd_handle_t start_webserver(void)
{
    httpd_handle_t server = NULL;
    httpd_config_t config = HTTPD_DEFAULT_CONFIG();

    ESP_LOGI(TAG, "Starting server on port: %d", config.server_port);
    if (httpd_start(&server, &config) == ESP_OK) {
        httpd_register_uri_handler(server, &root);
        return server;
    }

    ESP_LOGE(TAG, "Failed to start server!");
    return NULL;
}
//----------------------------------------------------------

void app_main(void)
{
    /* Initialize NVS (required for Wi-Fi) */
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES ||
        ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ESP_ERROR_CHECK(nvs_flash_init());
    }

    //start softap
    ESP_LOGI(TAG, "Starting SoftAP...");
    wifi_init_softap();

    // Start HTTP server
    start_webserver();
    ESP_LOGI(TAG, "HTTP server running!");
}
