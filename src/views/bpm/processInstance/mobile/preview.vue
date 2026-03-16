<script lang="ts" setup>
import { ArrowLeft, Loading } from '@element-plus/icons-vue'
import type { ApiAttrs } from '@form-create/element-ui/types/config'
import { ElButton, ElEmpty, ElIcon } from 'element-plus'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, toRaw } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { getApprovalDetail } from '@/api/bpm/processInstance'
import { FieldPermissionType } from '@/components/SimpleProcessDesignerV2/src/consts'
import {
  getAccessToken,
  getRefreshToken,
  removeToken,
  setAccessToken,
  setRefreshToken
} from '@/utils/auth'
import { BpmModelFormType } from '@/utils/constants'
import { setConfAndFields2 } from '@/utils/formCreate'

type EnvType = 'h5' | 'miniapp'
type ParentMessageType = 'FORM_CLOSE' | 'FORM_READY' | 'FORM_SUBMIT' | 'LOAD_ERROR'

type ParentMessage<T = Record<string, any>> = {
  data: T
  type: ParentMessageType
}

interface UniWebView {
  postMessage: (options: { data: any }) => void
  getEnv?: (callback: (res: any) => void) => void
  navigateBack?: (options?: { delta?: number }) => void
  navigateTo?: (options: {
    fail?: () => void
    success?: () => void
    url: string
  }) => void
  reLaunch?: (options: { url: string }) => void
  redirectTo?: (options: { url: string }) => void
  switchTab?: (options: { url: string }) => void
}

declare global {
  interface Window {
    uni?: UniWebView
  }
}

defineOptions({ name: 'BpmMobileFormPreview' })

const route = useRoute()
const router = useRouter()

const WX_JS_SDK_URL = 'https://res.wx.qq.com/open/js/jweixin-1.6.0.js'
const UNI_WEBVIEW_SDK_URL = 'https://unpkg.com/@dcloudio/uni-webview-js@0.0.3/index.js'

const scriptLoaderMap = new Map<string, Promise<void>>()
const originalAccessToken = getAccessToken()
const originalRefreshToken = getRefreshToken()

const envType = ref<EnvType>('h5')
const loading = ref(true)
const error = ref('')
const fApi = ref<ApiAttrs>()
const fieldPermissions = ref<Record<string, string>>({})
const processInstance = ref<any>(null)
const processDefinition = ref<any>(null)
const detailForm = ref<{
  option: Record<string, any>
  rule: any[]
  value: Record<string, any>
}>({
  option: {
    submitBtn: false,
    resetBtn: false
  },
  rule: [],
  value: {}
})

const title = computed(() => processInstance.value?.name || '流程表单')
const hasFormContent = computed(() => detailForm.value.rule.length > 0)
const processInstanceId = computed(() =>
  getQueryString(['processInstanceId', 'process_instance_id'])
)
const taskId = computed(() => getQueryString(['taskId', 'task_id']))
const activityId = computed(() => getQueryString(['activityId', 'activity_id']))
const backUrl = computed(() => getQueryString('backUrl'))

function getQueryString(keys: string | string[]) {
  const keyList = Array.isArray(keys) ? keys : [keys]
  for (const key of keyList) {
    const value = route.query[key]
    if (Array.isArray(value) && value[0]) {
      return value[0]
    }
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return ''
}

function safeClone<T>(value: T): T {
  try {
    const rawValue = toRaw(value)
    if (typeof structuredClone === 'function') {
      return structuredClone(rawValue)
    }
    return JSON.parse(JSON.stringify(rawValue))
  } catch (cloneError) {
    console.error('克隆对象失败:', cloneError)
    return {} as T
  }
}

function loadScript(src: string) {
  const cachedLoader = scriptLoaderMap.get(src)
  if (cachedLoader) {
    return cachedLoader
  }

  const loader = new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector(`script[src="${src}"]`) as
      | HTMLScriptElement
      | null

    if (existingScript?.dataset.loaded === 'true') {
      resolve()
      return
    }

    const targetScript = existingScript || document.createElement('script')

    targetScript.addEventListener(
      'load',
      () => {
        targetScript.dataset.loaded = 'true'
        resolve()
      },
      { once: true }
    )
    targetScript.addEventListener(
      'error',
      () => {
        scriptLoaderMap.delete(src)
        reject(new Error(`${src} 加载失败`))
      },
      { once: true }
    )

    if (!existingScript) {
      targetScript.type = 'text/javascript'
      targetScript.async = true
      targetScript.src = src
      document.head.append(targetScript)
    }
  })

  scriptLoaderMap.set(src, loader)
  return loader
}

async function loadMiniAppSdk() {
  try {
    await loadScript(WX_JS_SDK_URL)
  } catch (sdkError) {
    console.warn('微信 JSSDK 加载失败，继续尝试加载 UniApp SDK', sdkError)
  }

  await loadScript(UNI_WEBVIEW_SDK_URL)
}

async function loadUniWebViewSdk() {
  await loadScript(UNI_WEBVIEW_SDK_URL)
}

function emitToParent<T extends Record<string, any>>(message: ParentMessage<T>) {
  const payload = {
    source: 'bpm-mobile-form',
    envType: envType.value,
    type: message.type,
    data: message.data
  }

  if (window.uni?.postMessage) {
    window.uni.postMessage({ data: payload })
  }

  if (window.parent !== window) {
    window.parent.postMessage(payload, '*')
  }
}

function restoreAuthCache() {
  if (originalAccessToken || originalRefreshToken) {
    setAccessToken(originalAccessToken || undefined)
    setRefreshToken(originalRefreshToken || undefined)
    return
  }
  removeToken()
}

function initToken() {
  const token = getQueryString('token')
  if (!token) {
    return
  }
  setAccessToken(token)
  setRefreshToken()
}

function initEnvType() {
  const type = getQueryString('type')
  if (!type) {
    error.value = '缺少必填参数：type'
    return false
  }
  if (type !== 'h5' && type !== 'miniapp') {
    error.value = 'type 参数无效，必须是 h5 或 miniapp'
    return false
  }
  envType.value = type
  return true
}

function setFieldPermission(field: string, permission: string) {
  fieldPermissions.value[field] = permission
  if (permission === FieldPermissionType.READ) {
    fApi.value?.disabled(true, field)
    return
  }
  if (permission === FieldPermissionType.WRITE) {
    fApi.value?.disabled(false, field)
    return
  }
  if (permission === FieldPermissionType.NONE) {
    fApi.value?.hidden(true, field)
  }
}

function hideBuiltInButtons() {
  detailForm.value.option = {
    ...detailForm.value.option,
    submitBtn: false,
    resetBtn: false
  }
}

function getSameOriginParentWindow() {
  if (window.parent === window) {
    return null
  }

  try {
    void window.parent.location.href
    return window.parent
  } catch {
    return null
  }
}

function navigateByHistory() {
  if (window.history.length > 1) {
    router.back()
    return true
  }
  return false
}

function navigateByParentHistory() {
  const parentWindow = getSameOriginParentWindow()
  if (parentWindow?.history.length && parentWindow.history.length > 1) {
    parentWindow.history.back()
    return true
  }
  return false
}

function navigateByFallbackUrl() {
  const targetUrl = backUrl.value || document.referrer
  if (!targetUrl || targetUrl === window.location.href) {
    return false
  }
  window.location.replace(targetUrl)
  return true
}

function closeCurrentView() {
  if (window.uni?.navigateBack) {
    window.uni.navigateBack({ delta: 1 })
    return
  }

  if (navigateByHistory()) {
    return
  }

  if (navigateByParentHistory()) {
    return
  }

  if (navigateByFallbackUrl()) {
    return
  }

  window.close()
}

function closeCurrentViewLater() {
  window.setTimeout(() => {
    closeCurrentView()
  }, 80)
}

function handleBack() {
  emitToParent({
    type: 'FORM_CLOSE',
    data: {
      processInstanceId: processInstanceId.value,
      taskId: taskId.value
    }
  })
  closeCurrentViewLater()
}

function handleConfirm() {
  emitToParent({
    type: 'FORM_SUBMIT',
    data: {
      processInstanceId: processInstanceId.value,
      taskId: taskId.value,
      formValue: safeClone(detailForm.value.value),
      fieldPermissions: safeClone(fieldPermissions.value)
    }
  })
  closeCurrentViewLater()
}

async function getDetail() {
  loading.value = true
  error.value = ''

  try {
    if (!processInstanceId.value) {
      throw new Error('缺少必要参数：processInstanceId')
    }
    if (!getQueryString('token') && !getAccessToken()) {
      throw new Error('缺少访问令牌：token')
    }

    const data = await getApprovalDetail({
      processInstanceId: processInstanceId.value,
      taskId: taskId.value,
      activityId: activityId.value
    })

    if (!data) {
      throw new Error('查询不到审批详情信息')
    }
    if (!data.processDefinition || !data.processInstance) {
      throw new Error('查询不到流程信息')
    }

    processInstance.value = data.processInstance
    processDefinition.value = data.processDefinition

    if (processDefinition.value.formType !== BpmModelFormType.NORMAL) {
      throw new Error('当前流程不是普通表单，暂不支持移动端嵌入预览')
    }

    fieldPermissions.value = {}
    if (detailForm.value.rule.length > 0) {
      detailForm.value.value = processInstance.value.formVariables || {}
    } else {
      setConfAndFields2(
        detailForm,
        processDefinition.value.formConf,
        processDefinition.value.formFields,
        processInstance.value.formVariables || {}
      )
    }
    hideBuiltInButtons()

    await nextTick()
    fApi.value?.btn.show(false)
    fApi.value?.resetBtn.show(false)
    fApi.value?.disabled(true)

    if (data.formFieldsPermission) {
      Object.keys(data.formFieldsPermission).forEach((field) => {
        setFieldPermission(field, data.formFieldsPermission[field])
      })
    }

    emitToParent({
      type: 'FORM_READY',
      data: {
        processInstanceId: processInstanceId.value,
        taskId: taskId.value,
        title: title.value,
        hasFormContent: hasFormContent.value
      }
    })
  } catch (detailError) {
    error.value = detailError instanceof Error ? detailError.message : '审批详情加载失败'
    emitToParent({
      type: 'LOAD_ERROR',
      data: {
        processInstanceId: processInstanceId.value,
        taskId: taskId.value,
        message: error.value
      }
    })
  } finally {
    loading.value = false
  }
}

async function initPage() {
  if (!initEnvType()) {
    loading.value = false
    return
  }

  initToken()

  if (envType.value === 'miniapp') {
    try {
      await loadMiniAppSdk()
    } catch (sdkError) {
      error.value = sdkError instanceof Error ? sdkError.message : 'UniApp SDK 加载失败'
      loading.value = false
      emitToParent({
        type: 'LOAD_ERROR',
        data: {
          processInstanceId: processInstanceId.value,
          taskId: taskId.value,
          message: error.value
        }
      })
      return
    }
  } else {
    try {
      await loadUniWebViewSdk()
    } catch (sdkError) {
      console.warn('UniApp WebView SDK 加载失败，将仅使用浏览器回退能力', sdkError)
    }
  }

  await getDetail()
}

onMounted(() => {
  initPage()
})

onBeforeUnmount(() => {
  restoreAuthCache()
})
</script>

<template>
  <div class="mobile-form-preview">
    <header class="mobile-form-preview__header">
      <button class="mobile-form-preview__back" type="button" @click="handleBack">
        <ElIcon><ArrowLeft /></ElIcon>
        <span>返回</span>
      </button>
      <div class="mobile-form-preview__title">{{ title }}</div>
      <div class="mobile-form-preview__header-placeholder"></div>
    </header>

    <main class="mobile-form-preview__body">
      <div v-if="loading" class="mobile-form-preview__state">
        <ElIcon class="is-loading mobile-form-preview__loading-icon">
          <Loading />
        </ElIcon>
        <span>表单加载中...</span>
      </div>

      <ElEmpty v-else-if="error" :description="error">
        <ElButton type="primary" @click="getDetail">重新加载</ElButton>
      </ElEmpty>

      <ElEmpty v-else-if="!hasFormContent" description="暂无表单内容" />

      <div v-else class="mobile-form-preview__card">
        <div class="mobile-form-preview__meta">
          <div class="mobile-form-preview__meta-label">流程实例</div>
          <div class="mobile-form-preview__meta-value">
            {{ processInstanceId || '--' }}
          </div>
        </div>

        <form-create
          v-model="detailForm.value"
          v-model:api="fApi"
          :option="detailForm.option"
          :rule="detailForm.rule"
        />
      </div>
    </main>

    <footer v-if="!loading && !error && hasFormContent" class="mobile-form-preview__footer">
      <ElButton plain size="large" @click="handleBack">取消</ElButton>
      <ElButton type="primary" size="large" @click="handleConfirm">确定</ElButton>
    </footer>
  </div>
</template>

<style lang="scss" scoped>
.mobile-form-preview {
  height: 100%;
  display: flex;
  flex-direction: column;
  background:
    linear-gradient(180deg, #f4f7fb 0%, #eef2f8 120px, #f7f8fc 100%);
  color: #1f2937;
}

.mobile-form-preview__header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: grid;
  grid-template-columns: 88px 1fr 88px;
  align-items: center;
  min-height: 56px;
  padding: 0 12px;
  background: rgb(255 255 255 / 92%);
  backdrop-filter: blur(12px);
  box-shadow: 0 1px 0 rgb(15 23 42 / 6%);
}

.mobile-form-preview__back {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  width: fit-content;
  padding: 0;
  color: #2563eb;
  font-size: 14px;
  background: transparent;
  border: none;
}

.mobile-form-preview__title {
  overflow: hidden;
  padding: 0 8px;
  font-size: 16px;
  font-weight: 600;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-form-preview__header-placeholder {
  height: 1px;
}

.mobile-form-preview__body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 16px 96px;
  -webkit-overflow-scrolling: touch;
}

.mobile-form-preview__state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 220px;
  color: #64748b;
  font-size: 14px;
}

.mobile-form-preview__loading-icon {
  font-size: 28px;
  color: #2563eb;
}

.mobile-form-preview__card {
  padding: 16px;
  background: #fff;
  border: 1px solid rgb(148 163 184 / 12%);
  border-radius: 20px;
  box-shadow: 0 12px 32px rgb(15 23 42 / 6%);
}

.mobile-form-preview__meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #eef2f7;
}

.mobile-form-preview__meta-label {
  color: #64748b;
  font-size: 12px;
}

.mobile-form-preview__meta-value {
  color: #111827;
  font-size: 14px;
  font-weight: 500;
  word-break: break-all;
}

.mobile-form-preview__footer {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 20;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
  background: rgb(255 255 255 / 94%);
  box-shadow: 0 -10px 30px rgb(15 23 42 / 8%);
  backdrop-filter: blur(12px);
}

.mobile-form-preview__footer :deep(.el-button) {
  height: 46px;
  font-size: 15px;
  border-radius: 14px;
}

.mobile-form-preview__card :deep(.el-form-item) {
  margin-bottom: 20px;
}

@media (min-width: 768px) {
  .mobile-form-preview__body {
    padding-right: max(16px, calc((100vw - 720px) / 2));
    padding-left: max(16px, calc((100vw - 720px) / 2));
  }

  .mobile-form-preview__footer {
    right: max(0px, calc((100vw - 720px) / 2));
    left: max(0px, calc((100vw - 720px) / 2));
    border-radius: 20px 20px 0 0;
  }
}
</style>
