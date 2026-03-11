<template>
  <ContentWrap v-if="loading">
    <div v-loading="loading" class="loading-wrap"></div>
  </ContentWrap>

  <ProcessDefinitionDetail
    v-else-if="selectProcessDefinition"
    ref="processDefinitionDetailRef"
    :selectProcessDefinition="selectProcessDefinition"
    @cancel="handleCancel"
  />

  <ContentWrap v-else>
    <el-empty description="未匹配到可发起的流程定义">
      <el-button type="primary" @click="handleCancel">返回</el-button>
    </el-empty>
  </ContentWrap>
</template>

<script lang="ts" setup>
import * as DefinitionApi from '@/api/bpm/definition'
import * as ProcessInstanceApi from '@/api/bpm/processInstance'
import ProcessDefinitionDetail from './ProcessDefinitionDetail.vue'

defineOptions({ name: 'BpmProcessInstanceDirectCreate' })

const route = useRoute()
const { push, back } = useRouter()
const message = useMessage()

const loading = ref(false)
const selectProcessDefinition = ref<any>()
const processDefinitionDetailRef = ref()

const getQueryValue = (value: unknown) => {
  if (Array.isArray(value)) {
    return value[0]
  }
  return value
}

const getQueryString = (value: unknown) => {
  const result = getQueryValue(value)
  if (result === undefined || result === null) {
    return undefined
  }
  const str = String(result).trim()
  return str || undefined
}

const processDefinitionId = computed(() => getQueryString(route.query.processDefinitionId))
const processDefinitionKey = computed(() => getQueryString(route.query.processDefinitionKey))
const processInstanceId = computed(() => getQueryString(route.query.processInstanceId))

const findProcessDefinition = (
  processDefinitionList: any[],
  target: { id?: string; key?: string }
) => {
  return processDefinitionList.find((item: any) => {
    const byId = target.id && String(item.id) === String(target.id)
    const byKey = target.key && String(item.key) === String(target.key)
    return byId || byKey
  })
}

const getProcessDefinitionByInstanceId = async (instanceId: string) => {
  const processInstance = await ProcessInstanceApi.getProcessInstance(instanceId)
  const targetId = processInstance?.processDefinitionId
  const targetKey = processInstance?.processDefinition?.key
  if (!targetId && !targetKey) {
    return undefined
  }
  return await DefinitionApi.getProcessDefinition(
    targetId ? String(targetId) : undefined,
    targetKey
  )
}

const resolveProcessDefinition = async () => {
  const processDefinitionList = await DefinitionApi.getProcessDefinitionList({
    suspensionState: 1
  })
  let processDefinition =
    findProcessDefinition(processDefinitionList, {
      id: processDefinitionId.value,
      key: processDefinitionKey.value
    }) || undefined

  if (!processDefinition && processDefinitionId.value) {
    try {
      processDefinition = await DefinitionApi.getProcessDefinition(processDefinitionId.value)
    } catch {
      // ignore and continue fallback
    }
  }

  if (!processDefinition && processDefinitionKey.value) {
    try {
      processDefinition = await DefinitionApi.getProcessDefinition(undefined, processDefinitionKey.value)
    } catch {
      // ignore and continue fallback
    }
  }

  // 兼容上游把 processInstanceId 透传到 processDefinitionId 的场景
  if (!processDefinition && processDefinitionId.value) {
    try {
      processDefinition = await getProcessDefinitionByInstanceId(processDefinitionId.value)
    } catch {
      // ignore and continue fallback
    }
  }

  if (!processDefinition && processInstanceId.value) {
    try {
      processDefinition = await getProcessDefinitionByInstanceId(processInstanceId.value)
    } catch {
      // ignore and continue fallback
    }
  }
  return processDefinition
}

const fetchProcessDefinitionDetailById = async (id?: string | number) => {
  if (!id) {
    return undefined
  }
  // 必调：/admin-api/bpm/process-definition/get?id=
  return await DefinitionApi.getProcessDefinition(String(id))
}

const preloadApprovalDetail = async (id?: string | number) => {
  if (!id) {
    return
  }
  // 必调：/admin-api/bpm/process-instance/get-approval-detail?processDefinitionId=&activityId=StartUserNode
  await ProcessInstanceApi.getApprovalDetail({
    processDefinitionId: String(id),
    activityId: 'StartUserNode'
  })
}

const loadProcessDefinition = async () => {
  if (!processDefinitionId.value && !processDefinitionKey.value && !processInstanceId.value) {
    message.error('缺少流程定义参数，无法发起流程')
    return
  }
  let readyProcessDefinition: any
  loading.value = true
  try {
    const matchedProcessDefinition = await resolveProcessDefinition()
    if (!matchedProcessDefinition) {
      message.error('未匹配到可发起的流程定义，请检查项目流程配置')
      return
    }

    const targetDefinitionId =
      processDefinitionId.value || (matchedProcessDefinition.id ? String(matchedProcessDefinition.id) : undefined)

    let processDefinitionDetail = matchedProcessDefinition
    if (targetDefinitionId) {
      try {
        processDefinitionDetail =
          (await fetchProcessDefinitionDetailById(targetDefinitionId)) || matchedProcessDefinition
      } catch {
        processDefinitionDetail = matchedProcessDefinition
      }
    }

    await preloadApprovalDetail(processDefinitionDetail.id || targetDefinitionId)
    readyProcessDefinition = processDefinitionDetail
    selectProcessDefinition.value = processDefinitionDetail
  } finally {
    loading.value = false
  }

  if (readyProcessDefinition) {
    // 必须等 loading 分支切换完成后，子组件才会挂载并可调用 expose 方法
    await nextTick()
    processDefinitionDetailRef.value?.initProcessInfo(readyProcessDefinition)
  }
}

const handleCancel = async () => {
  const projectId = Number(getQueryString(route.query.projectId))
  if (projectId) {
    await push({
      name: 'ProjectStageDetail',
      params: { id: projectId }
    })
    return
  }
  if (window.history.length > 1) {
    back()
    return
  }
  await push({ name: 'BpmProcessInstanceMy' })
}

onMounted(() => {
  loadProcessDefinition()
})
</script>

<style lang="scss" scoped>
.loading-wrap {
  min-height: 320px;
}
</style>
