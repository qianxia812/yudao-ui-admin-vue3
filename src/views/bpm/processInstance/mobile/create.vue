<script lang="ts" setup>
import { ArrowLeft, Loading, Plus } from '@element-plus/icons-vue'
import type { ApiAttrs } from '@form-create/element-ui/types/config'
import { ElButton, ElEmpty, ElIcon, ElMessage, ElTag } from 'element-plus'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, toRaw, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import * as DefinitionApi from '@/api/bpm/definition'
import * as ProcessInstanceApi from '@/api/bpm/processInstance'
import type { ApprovalNodeInfo } from '@/api/bpm/processInstance'
import UserSelectForm from '@/components/UserSelectForm/index.vue'
import {
  CandidateStrategy,
  FieldPermissionType,
  NodeId
} from '@/components/SimpleProcessDesignerV2/src/consts'
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
type ParentMessageType = 'FORM_CLOSE' | 'FORM_CREATE_SUCCESS' | 'FORM_READY' | 'LOAD_ERROR'

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

defineOptions({ name: 'BpmMobileFormCreate' })

const route = useRoute()
const router = useRouter()

const WX_JS_SDK_URL = 'https://res.wx.qq.com/open/js/jweixin-1.6.0.js'
const UNI_WEBVIEW_SDK_URL = 'https://unpkg.com/@dcloudio/uni-webview-js@0.0.3/index.js'

const scriptLoaderMap = new Map<string, Promise<void>>()
const originalAccessToken = getAccessToken()
const originalRefreshToken = getRefreshToken()

const envType = ref<EnvType>('h5')
const loading = ref(true)
const submitting = ref(false)
const error = ref('')
const fApi = ref<ApiAttrs>()
const processDefinition = ref<any>(null)
const startUserSelectTasks = ref<ApprovalNodeInfo[]>([])
const startUserSelectAssignees = ref<Record<string, number[]>>({})
const customApproveUsers = ref<Record<string, any[]>>({})
const userSelectFormRef = ref<InstanceType<typeof UserSelectForm>>()
const approvalRefreshTimer = ref<number>()
const formInitialized = ref(false)

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

const title = computed(() => processDefinition.value?.name || '流程表单填写')
const hasFormContent = computed(() => detailForm.value.rule.length > 0)
const processDefinitionId = computed(() =>
  getQueryString(['processDefinitionId', 'process_definition_id'])
)
const processDefinitionKey = computed(() =>
  getQueryString(['processDefinitionKey', 'process_definition_key'])
)
const projectId = computed(() => getQueryString(['projectId', 'project_id']))
const businessKey = computed(() => getQueryString(['businessKey', 'business_key']))
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
      processDefinitionId: processDefinition.value?.id || processDefinitionId.value
    }
  })
  closeCurrentViewLater()
}

function resetPermissionState(field: string) {
  fApi.value?.hidden(false, field)
  fApi.value?.disabled(false, field)
}

function setFieldPermission(field: string, permission: string) {
  resetPermissionState(field)

  if (permission === FieldPermissionType.READ) {
    fApi.value?.disabled(true, field)

    try {
      const rule = fApi.value?.getRule(field)
      if (rule) {
        rule.$required = false
        if (rule.validate) {
          rule.validate = []
        }
      }
    } catch (permissionError) {
      console.warn('修改字段校验规则失败:', permissionError)
    }
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

function syncSelectableUsers(tasks: ApprovalNodeInfo[]) {
  const nextAssignees: Record<string, number[]> = {}
  const nextUsers: Record<string, any[]> = {}

  tasks.forEach((task) => {
    const key = String(task.id)
    nextAssignees[key] = startUserSelectAssignees.value[key] || []
    nextUsers[key] = customApproveUsers.value[key] || []
  })

  startUserSelectAssignees.value = nextAssignees
  customApproveUsers.value = nextUsers
}

async function refreshApprovalDetail(formValue: Record<string, any>) {
  if (!processDefinition.value?.id) {
    return
  }

  const data = await ProcessInstanceApi.getApprovalDetail({
    processDefinitionId: String(processDefinition.value.id),
    activityId: NodeId.START_USER_NODE_ID,
    processVariablesStr: JSON.stringify(formValue || {})
  })

  if (!data) {
    return
  }

  const selectableTasks =
    data.activityNodes?.filter(
      (node: ApprovalNodeInfo) => CandidateStrategy.START_USER_SELECT === node.candidateStrategy
    ) || []

  startUserSelectTasks.value = selectableTasks
  syncSelectableUsers(selectableTasks)

  if (data.formFieldsPermission) {
    Object.keys(data.formFieldsPermission).forEach((field) => {
      setFieldPermission(field, data.formFieldsPermission[field])
    })
  }
}

function scheduleApprovalRefresh(formValue: Record<string, any>) {
  if (!formInitialized.value) {
    return
  }

  if (approvalRefreshTimer.value) {
    window.clearTimeout(approvalRefreshTimer.value)
  }

  approvalRefreshTimer.value = window.setTimeout(() => {
    refreshApprovalDetail(safeClone(formValue))
  }, 300)
}

function handleSelectUser(task: ApprovalNodeInfo) {
  const taskKey = String(task.id)
  userSelectFormRef.value?.open(task.id, customApproveUsers.value[taskKey] || [])
}

function handleUserSelectConfirm(activityId: string, userList: any[]) {
  const key = String(activityId)
  customApproveUsers.value[key] = userList || []
  startUserSelectAssignees.value[key] = (userList || []).map((item: any) => item.id)
}

async function submitForm() {
  if (!fApi.value || !processDefinition.value?.id) {
    return
  }

  try {
    await fApi.value.validate()
  } catch (validationError) {
    console.warn('表单校验失败:', validationError)
    return
  }

  for (const userTask of startUserSelectTasks.value) {
    const taskKey = String(userTask.id)
    if (!startUserSelectAssignees.value[taskKey]?.length) {
      ElMessage.warning(`请选择 ${userTask.name} 的候选人`)
      return
    }
  }

  submitting.value = true
  try {
    const payload: Record<string, any> = {
      processDefinitionId: processDefinition.value.id,
      variables: safeClone(detailForm.value.value),
      startUserSelectAssignees: safeClone(startUserSelectAssignees.value)
    }

    if (projectId.value) {
      payload.projectId = projectId.value
    }

    if (businessKey.value) {
      payload.businessKey = businessKey.value
    }

    const result = await ProcessInstanceApi.createProcessInstance(payload)
    ElMessage.success('流程发起成功')
    emitToParent({
      type: 'FORM_CREATE_SUCCESS',
      data: {
        processDefinitionId: processDefinition.value.id,
        result,
        formValue: safeClone(detailForm.value.value)
      }
    })
    closeCurrentViewLater()
  } finally {
    submitting.value = false
  }
}

async function loadProcessDefinition() {
  if (!processDefinitionId.value && !processDefinitionKey.value) {
    throw new Error('缺少必要参数：processDefinitionId')
  }

  const definition =
    (await DefinitionApi.getProcessDefinition(
      processDefinitionId.value || undefined,
      processDefinitionKey.value || undefined
    )) || null

  if (!definition) {
    throw new Error('查询不到流程定义信息')
  }

  if (definition.formType !== BpmModelFormType.NORMAL) {
    throw new Error('当前流程不是普通表单，暂不支持移动端发起')
  }

  processDefinition.value = definition
}

async function initForm() {
  loading.value = true
  error.value = ''

  try {
    if (!getQueryString('token') && !getAccessToken()) {
      throw new Error('缺少访问令牌：token')
    }

    await loadProcessDefinition()

    setConfAndFields2(
      detailForm,
      processDefinition.value.formConf,
      processDefinition.value.formFields,
      {}
    )
    hideBuiltInButtons()

    await nextTick()
    fApi.value?.btn.show(false)
    fApi.value?.resetBtn.show(false)

    await refreshApprovalDetail(detailForm.value.value)
    formInitialized.value = true

    emitToParent({
      type: 'FORM_READY',
      data: {
        processDefinitionId: processDefinition.value.id,
        title: title.value,
        hasFormContent: hasFormContent.value
      }
    })
  } catch (initError) {
    error.value = initError instanceof Error ? initError.message : '流程表单加载失败'
    emitToParent({
      type: 'LOAD_ERROR',
      data: {
        processDefinitionId: processDefinitionId.value,
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
          processDefinitionId: processDefinitionId.value,
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

  await initForm()
}

watch(
  () => detailForm.value.value,
  (formValue) => {
    scheduleApprovalRefresh(formValue)
  },
  { deep: true }
)

onMounted(() => {
  initPage()
})

onBeforeUnmount(() => {
  if (approvalRefreshTimer.value) {
    window.clearTimeout(approvalRefreshTimer.value)
  }
  restoreAuthCache()
})
</script>

<template>
  <div class="mobile-form-create">
    <header class="mobile-form-create__header">
      <button class="mobile-form-create__back" type="button" @click="handleBack">
        <ElIcon><ArrowLeft /></ElIcon>
        <span>返回</span>
      </button>
      <div class="mobile-form-create__title">{{ title }}</div>
      <div class="mobile-form-create__header-placeholder"></div>
    </header>

    <main class="mobile-form-create__body">
      <div v-if="loading" class="mobile-form-create__state">
        <ElIcon class="is-loading mobile-form-create__loading-icon">
          <Loading />
        </ElIcon>
        <span>表单加载中...</span>
      </div>

      <ElEmpty v-else-if="error" :description="error">
        <ElButton type="primary" @click="initForm">重新加载</ElButton>
      </ElEmpty>

      <ElEmpty v-else-if="!hasFormContent" description="暂无可填写的表单内容" />

      <template v-else>
        <div class="mobile-form-create__card">
          <div class="mobile-form-create__meta">
            <div class="mobile-form-create__meta-label">流程定义</div>
            <div class="mobile-form-create__meta-value">
              {{ processDefinition?.id || processDefinitionId || '--' }}
            </div>
          </div>

          <form-create
            v-model="detailForm.value"
            v-model:api="fApi"
            :option="detailForm.option"
            :rule="detailForm.rule"
          />
        </div>

        <section
          v-if="startUserSelectTasks.length > 0"
          class="mobile-form-create__card mobile-form-create__card--compact"
        >
          <div class="mobile-form-create__section-title">指定审批人</div>

          <div
            v-for="task in startUserSelectTasks"
            :key="task.id"
            class="mobile-form-create__assignee-card"
          >
            <div class="mobile-form-create__assignee-header">
              <div class="mobile-form-create__assignee-name">{{ task.name }}</div>
              <ElButton text type="primary" @click="handleSelectUser(task)">
                <ElIcon><Plus /></ElIcon>
                <span>选择人员</span>
              </ElButton>
            </div>

            <div
              v-if="customApproveUsers[String(task.id)]?.length"
              class="mobile-form-create__assignee-tags"
            >
              <ElTag
                v-for="user in customApproveUsers[String(task.id)]"
                :key="user.id"
                effect="plain"
                round
              >
                {{ user.nickname }}
              </ElTag>
            </div>

            <div v-else class="mobile-form-create__assignee-empty">尚未选择候选人</div>
          </div>
        </section>
      </template>
    </main>

    <footer v-if="!loading && !error && hasFormContent" class="mobile-form-create__footer">
      <ElButton plain size="large" @click="handleBack">取消</ElButton>
      <ElButton type="primary" size="large" :loading="submitting" @click="submitForm">
        提交
      </ElButton>
    </footer>

    <UserSelectForm ref="userSelectFormRef" @confirm="handleUserSelectConfirm" />
  </div>
</template>

<style lang="scss" scoped>
.mobile-form-create {
  height: 100%;
  display: flex;
  flex-direction: column;
  background:
    linear-gradient(180deg, #f4f7fb 0%, #eef2f8 120px, #f7f8fc 100%);
  color: #1f2937;
}

.mobile-form-create__header {
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

.mobile-form-create__back {
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

.mobile-form-create__title {
  overflow: hidden;
  padding: 0 8px;
  font-size: 16px;
  font-weight: 600;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-form-create__header-placeholder {
  height: 1px;
}

.mobile-form-create__body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 16px 96px;
  -webkit-overflow-scrolling: touch;
}

.mobile-form-create__state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 220px;
  color: #64748b;
  font-size: 14px;
}

.mobile-form-create__loading-icon {
  font-size: 28px;
  color: #2563eb;
}

.mobile-form-create__card {
  padding: 16px;
  background: #fff;
  border: 1px solid rgb(148 163 184 / 12%);
  border-radius: 20px;
  box-shadow: 0 12px 32px rgb(15 23 42 / 6%);
}

.mobile-form-create__card--compact {
  margin-top: 12px;
}

.mobile-form-create__meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #eef2f7;
}

.mobile-form-create__meta-label,
.mobile-form-create__assignee-empty {
  color: #64748b;
  font-size: 12px;
}

.mobile-form-create__meta-value {
  color: #111827;
  font-size: 14px;
  font-weight: 500;
  word-break: break-all;
}

.mobile-form-create__section-title {
  margin-bottom: 12px;
  font-size: 15px;
  font-weight: 600;
}

.mobile-form-create__assignee-card {
  padding: 12px;
  background: #f8fafc;
  border: 1px solid #e5edf6;
  border-radius: 14px;
}

.mobile-form-create__assignee-card + .mobile-form-create__assignee-card {
  margin-top: 10px;
}

.mobile-form-create__assignee-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.mobile-form-create__assignee-name {
  font-size: 14px;
  font-weight: 500;
}

.mobile-form-create__assignee-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.mobile-form-create__footer {
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

.mobile-form-create__footer :deep(.el-button) {
  height: 46px;
  font-size: 15px;
  border-radius: 14px;
}

.mobile-form-create__card :deep(.el-form-item) {
  margin-bottom: 20px;
}

@media (min-width: 768px) {
  .mobile-form-create__body {
    padding-right: max(16px, calc((100vw - 720px) / 2));
    padding-left: max(16px, calc((100vw - 720px) / 2));
  }

  .mobile-form-create__footer {
    right: max(0px, calc((100vw - 720px) / 2));
    left: max(0px, calc((100vw - 720px) / 2));
    border-radius: 20px 20px 0 0;
  }
}
</style>
