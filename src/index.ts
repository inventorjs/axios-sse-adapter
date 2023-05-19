/**
 * sse 适配器
 */
import axios, { AxiosError, type AxiosAdapter, type AxiosResponse } from 'axios'
import { fetchEventSource } from '@microsoft/fetch-event-source'

const EventStream = 'text/event-stream'

const sseAdapter: AxiosAdapter = function sseAdapter(config) {
  return new Promise((resolve, reject) => {
    const { data, headers, method, signal, validateStatus, timeout, ...rest } =
      config
    const fullUrl = axios.getUri(config)
    const abortController = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    if (timeout && !signal) {
      timer = setTimeout(() => abortController.abort())
    }

    const stream = new ReadableStream({
      start(controller) {
        const request = fetchEventSource(fullUrl, {
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
              request,
            }
            if (!res.ok || (validateStatus && !validateStatus(statusCode))) {
              return reject(
                new AxiosError(
                  `Request failed with status code ${statusCode}`,
                  String(statusCode),
                  config,
                  request,
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
            controller.error(error)
          },
        })
      },
    })
  })
}

export default sseAdapter
