#include <stdio.h>          // printf, snprintf
#include <stdlib.h>         // malloc, free, realloc, bzero
#include <string.h>         // strlen, memcpy, bzero
#include <errno.h>          // errno

#include <sys/socket.h>     // socket, connect, setsockopt, write, read, close
#include <netdb.h>          // getaddrinfo, freeaddrinfo, struct addrinfo
#include <netinet/in.h>     // struct sockaddr_in
#include <arpa/inet.h>      // inet_ntoa

#include "esp_log.h"        // ESP_LOGI, ESP_LOGE

#include "http_utils.h"    // send_http_get, send_http_post

//caller must free returned string, can return NULL on failure
char *send_http_get(const char *server, const char *port, const char *path)
{
    const struct addrinfo hints = {
        .ai_family = AF_INET,
        .ai_socktype = SOCK_STREAM,
    };
    struct addrinfo *res;
    struct in_addr *addr;
    int s, r;
    char recv_buf[64];

    
    // Build GET request (same style as your original)
    char request[256];
    snprintf(request, sizeof(request),
             "GET %s HTTP/1.0\r\n"
             "Host: %s:%s\r\n"
             "User-Agent: esp32 curl\r\n"
             "\r\n",
             path, server, port);

    // DNS
    int err = getaddrinfo(server, port, &hints, &res);
    if (err != 0 || res == NULL)
    {
        ESP_LOGE("GET", "DNS lookup failed err=%d res=%p", err, res);
        return NULL;
    }

    addr = &((struct sockaddr_in *)res->ai_addr)->sin_addr;
    ESP_LOGI("GET", "DNS lookup succeeded. IP=%s", inet_ntoa(*addr));

    // Socket
    s = socket(res->ai_family, res->ai_socktype, 0);
    if (s < 0)
    {
        ESP_LOGE("GET", "Failed to allocate socket.");
        freeaddrinfo(res);
        return NULL;
    }
    ESP_LOGI("GET", "Allocated socket");

    if (connect(s, res->ai_addr, res->ai_addrlen) != 0)
    {
        ESP_LOGE("GET", "Socket connect failed errno=%d", errno);
        close(s);
        freeaddrinfo(res);
        return NULL;
    }

    ESP_LOGI("GET", "Connected");
    freeaddrinfo(res);

    // Send request
    if (write(s, request, strlen(request)) < 0)
    {
        ESP_LOGE("GET", "Socket send failed");
        close(s);
        return NULL;
    }
    ESP_LOGI("GET", "Socket send success");

    // Timeout
    struct timeval receiving_timeout;
    receiving_timeout.tv_sec = 5;
    receiving_timeout.tv_usec = 0;

    if (setsockopt(s, SOL_SOCKET, SO_RCVTIMEO, &receiving_timeout,
                   sizeof(receiving_timeout)) < 0)
    {
        ESP_LOGE("GET", "Failed to set socket receiving timeout");
        close(s);
        return NULL;
    }

    ESP_LOGI("GET", "Receiving timeout set");

    // Allocate response buffer (caller must free)
    size_t cap = 2048;
    size_t len = 0;
    char *response = malloc(cap);
    if (!response)
    {
        ESP_LOGE("GET", "Failed to allocate response buffer");
        close(s);
        return NULL;
    }

    // Read response
    do
    {
        bzero(recv_buf, sizeof(recv_buf));
        r = read(s, recv_buf, sizeof(recv_buf) - 1);

        if (r > 0)
        {
            // // print exactly like original code
            // for (int i = 0; i < r; i++)
            // {
            //     putchar(recv_buf[i]);
            // }

            // append to response buffer
            if (len + r + 1 > cap)
            {
                cap *= 2;
                char *newbuf = realloc(response, cap);
                if (!newbuf)
                {
                    free(response);
                    close(s);
                    return NULL;
                }
                response = newbuf;
            }

            memcpy(response + len, recv_buf, r);
            len += r;
        }

    } while (r > 0);

    ESP_LOGI("GET", "Done reading. Last return=%d errno=%d", r, errno);

    close(s);

    // Null terminate
    response[len] = '\0';

    return response;
}

void send_http_post(const char *post_data, const char *server, const char *port, const char *path)
{
    char request[512];
    const struct addrinfo hints = {
        .ai_family = AF_INET,
        .ai_socktype = SOCK_STREAM,
    };
    struct addrinfo *res;

    ESP_LOGI("POST", "Resolving host %s...", server);

    int err = getaddrinfo(server, port, &hints, &res);
    if (err != 0 || res == NULL)
    {
        ESP_LOGE("POST", "DNS lookup failed err=%d", err);
        return;
    }

    int sock = socket(res->ai_family, res->ai_socktype, 0);
    if (sock < 0)
    {
        ESP_LOGE("POST", "Failed to allocate socket.");
        freeaddrinfo(res);
        return;
    }

    if (connect(sock, res->ai_addr, res->ai_addrlen) != 0)
    {
        ESP_LOGE("POST", "Socket connect failed errno=%d", errno);
        close(sock);
        freeaddrinfo(res);
        return;
    }

    freeaddrinfo(res);

    // Build HTTP POST request
    snprintf(request, sizeof(request),
             "POST %s HTTP/1.0\r\n"
             "Host: %s:%s\r\n"
             "User-Agent: esp32 curl\r\n"
             "Content-Type: text/plain\r\n"
             "Content-Length: %d\r\n"
             "\r\n"
             "%s",
             path, server, port, (int)strlen(post_data), post_data);

    ESP_LOGI("POST", "Sending POST request...");

    if (write(sock, request, strlen(request)) < 0)
    {
        ESP_LOGE("POST", "Socket send failed");
        close(sock);
        return;
    }

    // Read response (optional)
    char recv_buf[512];
    int r = read(sock, recv_buf, sizeof(recv_buf) - 1);
    if (r > 0)
    {
        recv_buf[r] = 0;
        ESP_LOGI("POST", "Response:\n%s", recv_buf);
    }

    close(sock);
    ESP_LOGI("POST", "POST complete.");
}
