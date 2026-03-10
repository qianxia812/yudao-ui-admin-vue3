<template>
  <ContentWrap v-loading="pageLoading">
    <div class="project-header">
      <div class="project-title-row">
        <span class="project-title">{{ detail.projectName || '--' }}({{ detail.projectCode || '--' }})</span>
        <el-tag :type="getProjectStatusType(detail.projectStatus)" effect="plain" class="ml-10px">
          {{ getProjectStatusLabel(detail.projectStatus) }}
        </el-tag>
      </div>
      <div v-if="projectPriceText" class="project-line">项目报价：{{ projectPriceText }}</div>
      <div class="project-line">项目概述：{{ detail.remark || '--' }}</div>
      <div v-if="detail.archiveReason" class="project-line">归档原因：{{ detail.archiveReason }}</div>
    </div>

    <div v-if="groupList.length" class="group-tabs">
      <div
        v-for="item in groupList"
        :key="item.stageGroupCode"
        class="group-tab"
        :class="{ active: selectedGroupCode === item.stageGroupCode }"
        @click="handleGroupClick(item.stageGroupCode)"
      >
        <span class="group-sort">{{ getGroupSortLabel(item.sort) }}</span>
        <span class="group-name">{{ item.stageGroup || '--' }}</span>
      </div>
    </div>

    <div v-if="timelineLoading" class="timeline-loading">
      <el-skeleton :rows="5" animated />
    </div>

    <el-empty v-else-if="!groupList.length || !timelineList.length" description="暂无审批流" />

    <div v-else class="timeline-box">
      <div v-for="stage in timelineList" :key="stage.stageCode" class="stage-block">
        <div class="stage-title">{{ stage.stageName || stage.stageCode }}</div>
        <div class="stage-version-row">
          <template v-for="(version, index) in stage.versions" :key="version.id || `${stage.stageCode}-${index}`">
            <div
              class="version-card"
              :class="getVersionCardClass(version.status)"
              @click="openProcessDetail(version.processDefinitionId)"
            >
              <div class="version-title">{{ buildVersionTitle(version) }}</div>
              <div class="version-line">发起人员：{{ version.starterUserName || version.starterUserId || '--' }}</div>
              <div class="version-line">发起时间：{{ formatTime(version.startTime) }}</div>
              <div class="version-line">{{ buildEndLine(version) }}</div>
            </div>
            <div v-if="index < (stage.versions?.length || 0) - 1" class="version-arrow">
              <Icon icon="ep:arrow-right-bold" />
            </div>
          </template>
        </div>
      </div>
    </div>
  </ContentWrap>
</template>

<script setup lang="ts">
import { formatDate } from '@/utils/formatTime'
import {
  StageApi,
  type ProjectDetailVO,
  type StageGroupVO,
  type StageTimelineVO,
  type StageVersionVO
} from '@/api/project/projectstage'
import type { TagProps } from 'element-plus'

defineOptions({ name: 'ProjectStageDetail' })

type StatusItem = {
  value: number
  label: string
  type: TagProps['type']
}

const projectStatusOptions: StatusItem[] = [
  { value: 0, label: '未开始', type: 'warning' },
  { value: 1, label: '进行中', type: 'primary' },
  { value: 2, label: '已完成', type: 'success' },
  { value: 3, label: '已终止', type: 'danger' },
  { value: 4, label: '已归档', type: 'info' }
]

const stageStatusOptions: StatusItem[] = [
  { value: 0, label: '未开始', type: 'warning' },
  { value: 1, label: '审批中', type: 'primary' },
  { value: 2, label: '审批通过', type: 'success' },
  { value: 3, label: '审批不通过', type: 'danger' },
  { value: 4, label: '取消', type: 'info' },
  { value: 5, label: '终止', type: 'danger' }
]

const route = useRoute()
const { push } = useRouter()
const message = useMessage()

const pageLoading = ref(false)
const timelineLoading = ref(false)
const detail = ref<ProjectDetailVO>({})
const groupList = ref<StageGroupVO[]>([])
const timelineList = ref<StageTimelineVO[]>([])
const selectedGroupCode = ref('')

const projectId = computed(() => {
  const id = Number(route.params.id || route.query.id)
  return Number.isNaN(id) ? 0 : id
})

const projectPriceText = computed(() => {
  const value = detail.value.projectPrice ?? detail.value.projectQuote
  if (value === null || value === undefined || value === '') {
    return ''
  }
  const num = Number(value)
  if (Number.isNaN(num)) {
    return `${value}元`
  }
  return `${num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}元`
})

const getStatusLabel = (options: StatusItem[], value?: number) => {
  return options.find((item) => item.value === value)?.label || '--'
}

const getStatusType = (options: StatusItem[], value?: number): TagProps['type'] => {
  return options.find((item) => item.value === value)?.type || 'info'
}

const getProjectStatusLabel = (value?: number) => getStatusLabel(projectStatusOptions, value)
const getProjectStatusType = (value?: number) => getStatusType(projectStatusOptions, value)
const getStageStatusLabel = (value?: number) => getStatusLabel(stageStatusOptions, value)

const getGroupSortLabel = (sort?: number) => {
  if (!sort) {
    return '--'
  }
  return String(sort).padStart(2, '0')
}

const formatTime = (value?: string | null) => {
  if (!value) {
    return '--'
  }
  return formatDate(value as unknown as Date)
}

const buildVersionTitle = (version: StageVersionVO) => {
  const statusLabel = getStageStatusLabel(version.status)
  const versionLabel = version.versionNo && version.versionNo > 1 ? ` (V${version.versionNo})` : ''
  return `${version.stageName || '流程'}${statusLabel !== '--' ? statusLabel : ''}${versionLabel}`
}

const buildEndLine = (version: StageVersionVO) => {
  if (version.endTime) {
    return `结束时间：${formatTime(version.endTime)}`
  }
  if (version.status === 1) {
    return `当前审批：${version.currentAssigneeUserName || '--'}`
  }
  return '结束时间：--'
}

const getVersionCardClass = (status?: number) => {
  if (status === 1) {
    return 'is-running'
  }
  if (status === 3) {
    return 'is-reject'
  }
  if (status === 2) {
    return 'is-pass'
  }
  return ''
}

const openProcessDetail = (processDefinitionId?: string) => {
  if (!processDefinitionId) {
    return
  }
  push({
    name: 'BpmProcessInstanceDetail',
    query: { id: processDefinitionId }
  })
}

const fetchProjectDetail = async () => {
  detail.value = await StageApi.getProjectDetail(projectId.value)
}

const getDefaultGroupCode = (groups: StageGroupVO[]) => {
  const running = groups.find((item) => item.stageStatus === 1 && item.stageGroupCode)
  if (running?.stageGroupCode) {
    return running.stageGroupCode
  }
  const sorted = [...groups].sort((a, b) => (a.sort || 9999) - (b.sort || 9999))
  return sorted[0]?.stageGroupCode || ''
}

const fetchGroups = async () => {
  groupList.value = await StageApi.getProjectGroupList(projectId.value)
  selectedGroupCode.value = getDefaultGroupCode(groupList.value)
}

const fetchTimeline = async () => {
  if (!selectedGroupCode.value) {
    timelineList.value = []
    return
  }
  timelineLoading.value = true
  try {
    timelineList.value = await StageApi.getStageTimeline(projectId.value, selectedGroupCode.value)
  } finally {
    timelineLoading.value = false
  }
}

const handleGroupClick = (groupCode?: string) => {
  if (!groupCode || selectedGroupCode.value === groupCode) {
    return
  }
  selectedGroupCode.value = groupCode
  fetchTimeline()
}

const initData = async () => {
  if (!projectId.value) {
    message.error('缺少项目 ID 参数')
    return
  }
  pageLoading.value = true
  try {
    await fetchProjectDetail()
    await fetchGroups()
    await fetchTimeline()
  } finally {
    pageLoading.value = false
  }
}

onMounted(() => {
  initData()
})
</script>

<style scoped lang="scss">
.project-header {
  border-bottom: 1px solid var(--el-border-color-light);
  padding-bottom: 12px;
  margin-bottom: 12px;
}

.project-title-row {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}

.project-title {
  font-size: 28px;
  line-height: 40px;
  font-weight: 700;
  color: var(--el-text-color-primary);
}

.project-line {
  margin-top: 4px;
  color: var(--el-text-color-regular);
}

.group-tabs {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 14px;
}

.group-tab {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--el-text-color-regular);
  font-size: 16px;
  cursor: pointer;
  padding-bottom: 6px;
}

.group-tab.active {
  color: var(--el-color-primary);
  font-weight: 700;
}

.group-tab.active::after {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  content: '';
  border-bottom: 2px solid var(--el-color-primary);
}

.group-sort {
  color: inherit;
  font-size: 30px;
  font-weight: 600;
  line-height: 1;
}

.group-name {
  color: inherit;
  font-size: 18px;
  font-weight: 600;
}

.timeline-loading {
  padding: 12px 0;
}

.timeline-box {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.stage-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stage-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.stage-version-row {
  display: flex;
  align-items: stretch;
  flex-wrap: wrap;
  gap: 10px;
}

.version-card {
  width: 240px;
  min-height: 126px;
  border-radius: 8px;
  border: 1px solid var(--el-border-color-light);
  background: #f5f7fa;
  color: var(--el-text-color-regular);
  padding: 10px 12px;
  transition: all 0.2s;
}

.version-card:hover {
  border-color: var(--el-color-primary);
}

.version-card.is-running {
  background: var(--el-color-primary);
  border-color: var(--el-color-primary);
  color: #fff;
}

.version-card.is-pass {
  border-color: #67c23a;
}

.version-card.is-reject {
  border-color: #f56c6c;
}

.version-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 8px;
}

.version-line {
  margin-top: 4px;
  font-size: 14px;
}

.version-arrow {
  display: inline-flex;
  align-items: center;
  color: var(--el-color-primary);
  font-size: 18px;
}
</style>
