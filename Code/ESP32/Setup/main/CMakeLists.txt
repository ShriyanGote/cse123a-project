idf_component_register(SRCS "wifi_provisioning.c" "http_utils.c"
                    PRIV_REQUIRES esp_wifi nvs_flash esp_netif esp_http_server
                    INCLUDE_DIRS ".")
