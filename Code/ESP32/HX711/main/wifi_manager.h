#pragma once
#include <stddef.h>
#include <stdbool.h>
#include "esp_err.h"

/**
 * @file wifi_manager.h
 * @brief Wi-Fi + provisioning NVS (same layout as custom_ble_prov firmware).
 *
 * Credentials live in NVS namespace "prov" with keys auth_token, wifi_ssid,
 * wifi_pwd. After BLE writes all three, the device reboots; on the next boot
 * call wifi_apply_prov_and_connect() then wifi_wait_connected().
 */

#ifndef CSE123A_API_BASE
#define CSE123A_API_BASE "https://cse123a-project-6a3s.vercel.app"
#endif
#define CSE123A_INGEST_URL CSE123A_API_BASE "/api/ingest"

esp_err_t wifi_init(void);

void wifi_wait_connected(void);

/** True if STA already received an IPv4 address (IP_EVENT_STA_GOT_IP) this boot. */
bool wifi_sta_has_ip(void);

/** True if auth_token, wifi_ssid, and wifi_pwd are all present in NVS "prov". */
bool prov_credentials_saved(void);

/**
 * Persist provisioning triple to NVS (namespace "prov") and commit.
 * Used by BLE after AUTH + WIFI characteristics are written.
 */
esp_err_t wifi_prov_save(const char *auth_token, const char *ssid, const char *pwd);

/** Load auth_token from NVS into out (NUL-terminated). */
esp_err_t wifi_get_prov_auth_token(char *out, size_t cap);

/** STA MAC as 12 lowercase hex chars (matches QR device_id in ble.c). */
void wifi_get_device_id_from_mac(char *out, size_t cap);

/**
 * Load SSID/password from NVS, apply to STA, and start connection.
 * Requires wifi_init() already called.
 */
esp_err_t wifi_apply_prov_and_connect(void);
