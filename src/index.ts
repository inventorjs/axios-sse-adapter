/**
 * sse 适配器
 */
import axios, { AxiosError, type AxiosAdapter, type AxiosResponse, type AxiosRequestConfig } from 'axios'
import { fetchEventSource } from '@microsoft/fetch-event-source'

interface ConfigWithRetry extends AxiosRequestConfig {
  retryInterval?: number
}

const EventStream = 'text/event-stream'

const sseAdapter: AxiosAdapter = function sseAdapter(config) {
  return new Promise((resolve, reject) => {
    const { data, headers, method, signal, validateStatus, timeout, ...rest } =
      config
    const fullUrl = axios.getUri(config)
    const abortController = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    if (!signal && Number(timeout) > 0) {
      timer = setTimeout(() => abortController.abort(), timeout)
    }

    const stream = new ReadableStream({
      start(controller) {
        fetchEventSource(fullUrl, {
          ...rest,
          headers,
          method,
          body: data,
          signal: (signal ?? abortController.signal) as AbortSignal,
          async onopen(res) {
            clearTimeout(timer)
            const statusCode = res.status
            const response: AxiosResponse = {
              data: stream,
              status: statusCode,
              statusText: res.statusText,
              headers: Object.fromEntries([
                ...(res.headers as unknown as Map<string, string>),
              ]),
              config,
              request: null,
            }
            if (!res.ok || (validateStatus && !validateStatus(statusCode))) {
              return reject(
                new AxiosError(
                  `Request failed with status code ${statusCode}`,
                  String(statusCode),
                  config,
                  null,
                  response,
                ),
              )
            }
            if (res.headers.get('content-type') !== EventStream) {
              controller.enqueue(res.body)
            }
            resolve(response)
          },
          onmessage(ev) {
            if (ev.data === '[DONE]') {
              return
            }
            controller.enqueue(ev.data)
          },
          onclose() {
            controller.close()
          },
          onerror(error) {
            // 触发外部 read error
            controller.error(error)
            // 重试配置
            const retryConfig = config as ConfigWithRetry
            if (retryConfig.retryInterval) {
              return retryConfig.retryInterval
            }
            // 终止重试
            throw error
          },
        }).catch((error) => reject(new AxiosError(error.message, '0', config)));
      },
    })
  })
}

export default sseAdapter
