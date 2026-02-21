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

// http
#include "esp_netif.h"
#include "esp_event.h"
#include "esp_http_server.h"

//-----------------------Config-----------------------------
// WIFI SSID
#define WIFI_SSID "wifi that steals your data"

static const char *TAG = "esp_setup_softap_http";
//----------------------------------------------------------

//+++++++++++++++++++++++++WiFi+++++++++++++++++++++++++++++
static void wifi_event_handler(void *arg, esp_event_base_t event_base,
                               int32_t event_id, void *event_data)
{
    if (event_id == WIFI_EVENT_AP_STACONNECTED)
    {
        wifi_event_ap_staconnected_t *event = (wifi_event_ap_staconnected_t *)event_data;
        ESP_LOGI(TAG, "station " MACSTR " join, AID=%d",
                 MAC2STR(event->mac), event->aid);
    }
    else if (event_id == WIFI_EVENT_AP_STADISCONNECTED)
    {
        wifi_event_ap_stadisconnected_t *event = (wifi_event_ap_stadisconnected_t *)event_data;
        ESP_LOGI(TAG, "station " MACSTR " leave, AID=%d, reason=%d",
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
            .ssid_len = 0, // auto-calc
            .channel = 1,
            .password = "", // empty = open network
            .max_connection = 1,
            .authmode = WIFI_AUTH_OPEN},
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
/* URL decode (for wifi credentials) */
void url_decode(char *dst, const char *src) {
    while (*src)
    {
        if (*src == '+')
        {
            *dst++ = ' ';
            src++;
        }
        else if (*src == '%' && isxdigit((unsigned char)src[1]) && isxdigit((unsigned char)src[2]))
        {
            int val;
            sscanf(src + 1, "%2x", &val);
            *dst++ = (char)val;
            src += 3;
        }
        else
        {
            *dst++ = *src++;
        }
    }
    *dst = '\0';
}
void parse_http_credentials_data(const char *data, char *ssid, char *pass)
{
    // Format: ssid=MySSID&pass=MyPassword
    char *p = strstr(data, "&pass=");
    if (p)
    {
        size_t ssid_len = p - (data + 5); // 5 = length of "ssid="
        if (ssid_len >= 64)
            ssid_len = 63; // prevent overflow
        strncpy(ssid, data + 5, ssid_len);
        ssid[ssid_len] = '\0';

        // Everything after "&pass=" is the password
        strncpy(pass, p + 6, 63); // 6 = length of "&pass="
        pass[63] = '\0';
    }
}

/* Simple GET handler for "/" */
static esp_err_t root_get_handler(httpd_req_t *req)
{
    const char *html =
        "<!DOCTYPE html>"
        "<html>"
        "<head><title>ESP32 WiFi Setup</title></head>"
        "<body>"
        "<h1>Enter WiFi Credentials</h1>"
        "<form action=\"/wifi\" method=\"POST\">"
        "SSID: <input type=\"text\" name=\"ssid\"><br>"
        "Password: <input type=\"password\" name=\"pass\"><br>"
        "<input type=\"submit\" value=\"Submit\">"
        "</form>"
        "</body>"
        "</html>";

    httpd_resp_set_type(req, "text/html");
    httpd_resp_send(req, html, HTTPD_RESP_USE_STRLEN);
    return ESP_OK;
}

/* POST /wifi -> receive SSID/password */
static esp_err_t wifi_post_handler(httpd_req_t *req)
{
    char buf[128];
    int ret, remaining = req->content_len;

    // Read the POST body (form data)
    if (remaining >= sizeof(buf))
        remaining = sizeof(buf) - 1; // prevent overflow
    ret = httpd_req_recv(req, buf, remaining);
    if (ret <= 0)
    {
        ESP_LOGE(TAG, "Failed to read POST data");
        httpd_resp_send_500(req);
        return ESP_FAIL;
    }
    buf[ret] = '\0'; // null-terminate

    // decode URL-encoded form data
    char decoded[128];
    url_decode(decoded, buf);
    ESP_LOGI(TAG, "Received POST data: %s", decoded);

    // Parse the decoded string
    // Format: ssid=MySSID&pass=MyPassword
    char ssid[64] = {0};
    char pass[64] = {0};
    parse_http_credentials_data(decoded, ssid, pass);
    ESP_LOGI(TAG, "SSID: '%s'", ssid);
    ESP_LOGI(TAG, "Password: '%s'", pass);

    // Respond with a confirmation page
    httpd_resp_set_type(req, "text/html");
    httpd_resp_send(req,
                    "<!DOCTYPE html>"
                    "<html>"
                    "<body>"
                    "<h1>Credentials received!</h1>"
                    "<p>Check the ESP log for details.</p>"
                    "<form action='/' method='get'>"
                    "  <button type='submit'>Send Again</button>"
                    "</form>"
                    "</body>"
                    "</html>",
                    HTTPD_RESP_USE_STRLEN);
    return ESP_OK;
}

/* URI registration */
static httpd_uri_t root = {
    .uri = "/",
    .method = HTTP_GET,
    .handler = root_get_handler,
    .user_ctx = NULL};
static httpd_uri_t wifi = {
    .uri = "/wifi",
    .method = HTTP_POST,
    .handler = wifi_post_handler,
};

/* Start the HTTP server */
static httpd_handle_t start_webserver(void)
{
    httpd_handle_t server = NULL;
    httpd_config_t config = HTTPD_DEFAULT_CONFIG();

    ESP_LOGI(TAG, "Starting server on port: %d", config.server_port);
    if (httpd_start(&server, &config) == ESP_OK)
    {
        httpd_register_uri_handler(server, &root);
        httpd_register_uri_handler(server, &wifi);
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
        ret == ESP_ERR_NVS_NEW_VERSION_FOUND)
    {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ESP_ERROR_CHECK(nvs_flash_init());
    }

    // start softap
    ESP_LOGI(TAG, "Starting SoftAP...");
    wifi_init_softap();

    // Start HTTP server
    start_webserver();
    ESP_LOGI(TAG, "HTTP server running!");
}
