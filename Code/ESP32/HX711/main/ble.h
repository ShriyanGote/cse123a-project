#ifndef BLE_PROVISIONING_H
#define BLE_PROVISIONING_H

#include <stdbool.h>
#include "esp_err.h"
#include "ble.c"

#ifdef __cplusplus
extern "C" {
#endif

esp_err_t ble_provisioning_init(void);

bool ble_is_provisioned(void);

const char *ble_get_auth_token(void);

const char *ble_get_device_id(void);

void ble_notify_status(const char *msg);


#ifdef __cplusplus
}
#endif

#endif // BLE_PROVISIONING_H