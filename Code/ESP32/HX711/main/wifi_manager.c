/**
 * @file wifi_manager.c
 * @brief Wi-Fi stack + NVS "prov" credentials (aligned with custom_ble_prov).
 */

#include <string.h>
#include "wifi_manager.h"

#include "lwip/ip4_addr.h"
#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"

#include "esp_log.h"
#include "esp_mac.h"
#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_netif.h"
#include "nvs.h"
#include <stdbool.h>

static const char *TAG = "WIFI";

/* Same NVS layout as Code/ESP32/provisioning/custom_ble_prov/main/main.c */
#define PROV_NVS_NS   "prov"
#define PROV_KEY_AUTH "auth_token"
#define PROV_KEY_SSID "wifi_ssid"
#define PROV_KEY_PWD  "wifi_pwd"

static EventGroupHandle_t wifi_event_group;
#define WIFI_CONNECTED_BIT BIT0

static bool s_wifi_driver_inited = false;
static bool s_sta_started = false;

static void event_handler(void *arg, esp_event_base_t event_base, int32_t event_id, void *event_data)
{
    (void)arg;

    /* Do not call esp_wifi_connect() here: STA_START runs right after esp_wifi_start()
     * in wifi_init(), before main applies SSID/password from NVS "prov". A second
     * esp_wifi_connect() then returns ESP_ERR_WIFI_CONN ("sta is connecting") and
     * aborts the app if wrapped in ESP_ERROR_CHECK. */

    if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_DISCONNECTED) {
        ESP_LOGW(TAG, "Disconnected, retrying...");
        esp_wifi_connect();
    }

    if (event_base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t *event = (ip_event_got_ip_t *)event_data;
        ESP_LOGI(TAG, "Got IP: " IPSTR, IP2STR(&event->ip_info.ip));
        xEventGroupSetBits(wifi_event_group, WIFI_CONNECTED_BIT);
    }
}

esp_err_t wifi_init(void)
{
    if (s_wifi_driver_inited) {
        return ESP_OK;
    }

    wifi_event_group = xEventGroupCreate();

    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_create_default_wifi_sta();

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));

    ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID, &event_handler, NULL));
    ESP_ERROR_CHECK(esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, &event_handler, NULL));

    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_start());
    s_sta_started = true;

    s_wifi_driver_inited = true;
    return ESP_OK;
}

void wifi_wait_connected(void)
{
    xEventGroupWaitBits(wifi_event_group, WIFI_CONNECTED_BIT, false, true, portMAX_DELAY);
    ESP_LOGI(TAG, "WiFi connected!");
}

bool wifi_sta_has_ip(void)
{
    if (wifi_event_group == NULL) {
        return false;
    }
    return (xEventGroupGetBits(wifi_event_group) & WIFI_CONNECTED_BIT) != 0;
}

bool prov_credentials_saved(void)
{
    nvs_handle_t h;
    esp_err_t err = nvs_open(PROV_NVS_NS, NVS_READONLY, &h);
    if (err != ESP_OK) {
        return false;
    }

    size_t auth_len = 0, ssid_len = 0, pwd_len = 0;
    err = nvs_get_str(h, PROV_KEY_AUTH, NULL, &auth_len);
    if (err != ESP_OK || auth_len <= 1) {
        nvs_close(h);
        return false;
    }
    err = nvs_get_str(h, PROV_KEY_SSID, NULL, &ssid_len);
    if (err != ESP_OK || ssid_len <= 1) {
        nvs_close(h);
        return false;
    }
    err = nvs_get_str(h, PROV_KEY_PWD, NULL, &pwd_len);
    nvs_close(h);
    return err == ESP_OK && pwd_len >= 1; /* open network: empty password allowed */
}

esp_err_t wifi_prov_save(const char *auth_token, const char *ssid, const char *pwd)
{
    if (!auth_token || !ssid || !pwd) {
        return ESP_ERR_INVALID_ARG;
    }

    nvs_handle_t h;
    esp_err_t err = nvs_open(PROV_NVS_NS, NVS_READWRITE, &h);
    if (err != ESP_OK) {
        return err;
    }
    if ((err = nvs_set_str(h, PROV_KEY_AUTH, auth_token)) != ESP_OK) {
        goto done;
    }
    if ((err = nvs_set_str(h, PROV_KEY_SSID, ssid)) != ESP_OK) {
        goto done;
    }
    if ((err = nvs_set_str(h, PROV_KEY_PWD, pwd)) != ESP_OK) {
        goto done;
    }
    err = nvs_commit(h);
done:
    nvs_close(h);
    return err;
}

esp_err_t wifi_get_prov_auth_token(char *out, size_t cap)
{
    if (!out || cap == 0) {
        return ESP_ERR_INVALID_ARG;
    }
    out[0] = '\0';

    nvs_handle_t h;
    esp_err_t err = nvs_open(PROV_NVS_NS, NVS_READONLY, &h);
    if (err != ESP_OK) {
        return err;
    }
    size_t len = cap;
    err = nvs_get_str(h, PROV_KEY_AUTH, out, &len);
    nvs_close(h);
    return err;
}

void wifi_get_device_id_from_mac(char *out, size_t cap)
{
    if (!out || cap < 13) {
        return;
    }
    uint8_t mac[6];
    if (esp_read_mac(mac, ESP_MAC_WIFI_STA) != ESP_OK) {
        out[0] = '\0';
        return;
    }
    snprintf(out, cap, "%02x%02x%02x%02x%02x%02x", mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
}

esp_err_t wifi_apply_prov_and_connect(void)
{
    nvs_handle_t h;
    esp_err_t err = nvs_open(PROV_NVS_NS, NVS_READONLY, &h);
    if (err != ESP_OK) {
        return err;
    }

    char ssid[33] = {0};
    char password[65] = {0};
    size_t ssid_len = sizeof(ssid);
    size_t pass_len = sizeof(password);

    err = nvs_get_str(h, PROV_KEY_SSID, ssid, &ssid_len);
    if (err == ESP_OK) {
        err = nvs_get_str(h, PROV_KEY_PWD, password, &pass_len);
    }
    nvs_close(h);
    if (err != ESP_OK) {
        return err;
    }

    xEventGroupClearBits(wifi_event_group, WIFI_CONNECTED_BIT);

    wifi_config_t wifi_config = {0};
    strncpy((char *)wifi_config.sta.ssid, ssid, sizeof(wifi_config.sta.ssid) - 1);
    strncpy((char *)wifi_config.sta.password, password, sizeof(wifi_config.sta.password) - 1);

    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_config));
    ESP_LOGI(TAG, "Applying stored SSID and connecting...");

    err = esp_wifi_connect();
    if (err == ESP_ERR_WIFI_CONN) {
        ESP_LOGW(TAG, "Connect already in progress; waiting for result");
        return ESP_OK;
    }
    return err;
}
