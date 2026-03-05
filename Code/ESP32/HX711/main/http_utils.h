#pragma once



/**
 * @brief Send an HTTP GET request to the specified server and path.
 * 
 * @param server The server hostname or IP address (e.g., "example.com")
 * @param port The port as string (e.g., "80")
 * @param path The URL path (e.g., "/api/data")
 * @return char* Pointer to response buffer. Caller must free. Returns NULL on failure.
 */
char *send_http_get(const char *server, const char *port, const char *path);
//example usage:
    // char *resp = send_http_get("example.com", "80", "/");
    // if (resp != NULL) printf("Response:\n%s\n", resp);
    // else printf("Failed to get response\n");
    // free(resp);


/**
 * @brief Send an HTTP POST request to the specified server.
 * 
 * @param post_data The data to POST
 * @param server The server hostname or IP address
 * @param port The port as string (e.g., "80")
 * @param path The URL path (e.g., "/api/data")
 */
void send_http_post(const char *post_data, const char *server, const char *port, const char *path);
//example usage:
    // send_http_post("key=echo_this_back", "httpbin.org", "80", "/post");

