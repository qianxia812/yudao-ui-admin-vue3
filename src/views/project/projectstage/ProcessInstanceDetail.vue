<template>
  <ContentWrap :bodyStyle="{ padding: '10px 20px 0' }" class="position-relative">
    <div class="process-instance-main">
      <el-scrollbar>
        <img
          class="position-absolute right-20px"
          width="150"
          :src="auditIconsMap[processInstance.status]"
          alt=""
        />
        <div class="flex items-center">
          <div class="text-#878c93 h-15px">编号：{{ id }}</div>
          <Icon icon="ep:printer" class="ml-15px cursor-pointer" @click="handlePrint" />
          <el-button v-if="props.projectId" link type="primary" class="ml-12px" @click="handleBack">
            返回项目详情
          </el-button>
        </div>
        <el-divider class="!my-8px" />
        <div class="flex items-center gap-5 mb-10px h-40px">
          <div class="text-26px font-bold mb-5px">{{ processInstance.name || '--' }}</div>
          <dict-tag
            v-if="processInstance.status !== undefined && processInstance.status !== null"
            :type="DICT_TYPE.BPM_PROCESS_INSTANCE_STATUS"
            :value="processInstance.status"
          />
        </div>

        <div class="flex items-center gap-5 mb-10px text-13px h-35px">
          <div
            class="bg-gray-100 h-35px rounded-3xl flex items-center p-8px gap-2 dark:color-gray-600"
          >
            <el-avatar
              v-if="processInstance?.startUser?.avatar"
              :size="28"
              :src="processInstance.startUser.avatar"
            />
            <el-avatar v-else-if="processInstance?.startUser?.nickname" :size="28">
              {{ processInstance.startUser.nickname.substring(0, 1) }}
            </el-avatar>
            <span>{{ processInstance?.startUser?.nickname || '--' }}</span>
          </div>
          <div class="text-#878c93">{{ formatDate(processInstance.startTime) }} 提交</div>
        </div>

        <el-tabs v-model="activeTab">
          <el-tab-pane label="审批详情" name="form">
            <div class="form-scroll-area">
              <el-scrollbar>
                <el-row>
                  <el-col :span="17" class="!flex !flex-col form-col">
                    <div
                      v-loading="processInstanceLoading"
                      class="form-box flex flex-col mb-30px flex-1"
                    >
                      <el-col v-if="processDefinition?.formType === BpmModelFormType.NORMAL">
                        <form-create
                          v-model="detailForm.value"
                          v-model:api="fApi"
                          :option="detailForm.option"
                          :rule="detailForm.rule"
                        />
                      </el-col>
                      <div v-else-if="processDefinition?.formType === BpmModelFormType.CUSTOM">
                        <BusinessFormComponent :id="processInstance.businessKey" />
                      </div>
                    </div>
                  </el-col>
                  <el-col :span="7">
                    <ProcessInstanceTimeline :activity-nodes="activityNodes" />
                  </el-col>
                </el-row>
              </el-scrollbar>
            </div>
          </el-tab-pane>

          <el-tab-pane label="流程图" name="diagram">
            <div class="form-scroll-area">
              <ProcessInstanceSimpleViewer
                v-show="processDefinition.modelType === BpmModelType.SIMPLE"
                :loading="processInstanceLoading"
                :model-view="processModelView"
              />
              <ProcessInstanceBpmnViewer
                v-show="processDefinition.modelType === BpmModelType.BPMN"
                :loading="processInstanceLoading"
                :model-view="processModelView"
              />
            </div>
          </el-tab-pane>

          <el-tab-pane label="流转记录" name="record">
            <div class="form-scroll-area">
              <el-scrollbar>
                <ProcessInstanceTaskList :loading="processInstanceLoading" :id="id" />
              </el-scrollbar>
            </div>
          </el-tab-pane>
        </el-tabs>
      </el-scrollbar>
    </div>
  </ContentWrap>

  <PrintDialog ref="printRef" />
</template>

<script lang="ts" setup>
import { formatDate } from '@/utils/formatTime'
import { DICT_TYPE } from '@/utils/dict'
import { BpmModelFormType, BpmModelType } from '@/utils/constants'
import { setConfAndFields2 } from '@/utils/formCreate'
import { registerComponent } from '@/utils/routerHelper'
import type { ApiAttrs } from '@form-create/element-ui/types/config'
import * as ProcessInstanceApi from '@/api/bpm/processInstance'
import { FieldPermissionType } from '@/components/SimpleProcessDesignerV2/src/consts'
import { TaskStatusEnum } from '@/api/bpm/task'
import runningSvg from '@/assets/svgs/bpm/running.svg'
import approveSvg from '@/assets/svgs/bpm/approve.svg'
import rejectSvg from '@/assets/svgs/bpm/reject.svg'
import cancelSvg from '@/assets/svgs/bpm/cancel.svg'
import ProcessInstanceBpmnViewer from '@/views/bpm/processInstance/detail/ProcessInstanceBpmnViewer.vue'
import ProcessInstanceSimpleViewer from '@/views/bpm/processInstance/detail/ProcessInstanceSimpleViewer.vue'
import ProcessInstanceTaskList from '@/views/bpm/processInstance/detail/ProcessInstanceTaskList.vue'
import ProcessInstanceTimeline from '@/views/bpm/processInstance/detail/ProcessInstanceTimeline.vue'
import PrintDialog from '@/views/bpm/processInstance/detail/PrintDialog.vue'

defineOptions({ name: 'ProjectProcessInstanceDetail' })

const props = defineProps<{
  id: string
  taskId?: string
  activityId?: string
  projectId?: string
}>()

const { push, back } = useRouter()
const message = useMessage()
const processInstanceLoading = ref(false)
const processInstance = ref<any>({})
const processDefinition = ref<any>({})
const processModelView = ref<any>({})
const activeTab = ref('form')
const printRef = ref()

const auditIconsMap = {
  [TaskStatusEnum.RUNNING]: runningSvg,
  [TaskStatusEnum.APPROVE]: approveSvg,
  [TaskStatusEnum.REJECT]: rejectSvg,
  [TaskStatusEnum.CANCEL]: cancelSvg
}

const fApi = ref<ApiAttrs>()
const detailForm = ref({
  rule: [],
  option: {},
  value: {}
})
const BusinessFormComponent = ref<any>(null)
const activityNodes = ref<ProcessInstanceApi.ApprovalNodeInfo[]>([])

const setFieldPermission = (field: string, permission: string) => {
  if (permission === FieldPermissionType.READ) {
    // @ts-ignore
    fApi.value?.disabled(true, field)
  }
  if (permission === FieldPermissionType.WRITE) {
    // @ts-ignore
    fApi.value?.disabled(false, field)
  }
  if (permission === FieldPermissionType.NONE) {
    // @ts-ignore
    fApi.value?.hidden(true, field)
  }
}

const getApprovalDetail = async () => {
  processInstanceLoading.value = true
  try {
    const data = await ProcessInstanceApi.getApprovalDetail({
      processInstanceId: props.id,
      activityId: props.activityId,
      taskId: props.taskId
    })
    if (!data) {
      message.error('查询不到审批详情信息')
      return
    }
    if (!data.processDefinition || !data.processInstance) {
      message.error('查询不到流程信息')
      return
    }
    processInstance.value = data.processInstance
    processDefinition.value = data.processDefinition

    if (processDefinition.value.formType === BpmModelFormType.NORMAL) {
      const formFieldsPermission = data.formFieldsPermission
      if (detailForm.value.rule?.length > 0) {
        detailForm.value.value = processInstance.value.formVariables
      } else {
        setConfAndFields2(
          detailForm,
          processDefinition.value.formConf,
          processDefinition.value.formFields,
          processInstance.value.formVariables
        )
      }
      nextTick().then(() => {
        fApi.value?.btn.show(false)
        fApi.value?.resetBtn.show(false)
        // @ts-ignore
        fApi.value?.disabled(true)
        if (formFieldsPermission) {
          Object.keys(formFieldsPermission).forEach((item) => {
            setFieldPermission(item, formFieldsPermission[item])
          })
        }
      })
    } else if (processDefinition.value.formType === BpmModelFormType.CUSTOM) {
      BusinessFormComponent.value = registerComponent(processDefinition.value.formCustomViewPath)
    }

    activityNodes.value = data.activityNodes || []
  } finally {
    processInstanceLoading.value = false
  }
}

const getProcessModelView = async () => {
  if (BpmModelType.BPMN === processDefinition.value?.modelType) {
    processModelView.value = {
      bpmnXml: ''
    }
  }
  const data = await ProcessInstanceApi.getProcessInstanceBpmnModelView(props.id)
  if (data) {
    processModelView.value = data
  }
}

const getDetail = async () => {
  await getApprovalDetail()
  await getProcessModelView()
}

const handlePrint = async () => {
  printRef.value.open(props.id)
}

const handleBack = async () => {
  const currentProjectId = Number(props.projectId)
  if (currentProjectId) {
    await push({
      name: 'ProjectStageDetail',
      params: { id: currentProjectId }
    })
    return
  }
  back()
}

onMounted(() => {
  getDetail()
})
</script>

<style lang="scss" scoped>
$process-header-height: 194px;

.process-instance-main {
  height: calc(
    100vh - var(--top-tool-height) - var(--tags-view-height) - var(--app-footer-height) - 35px
  );
  max-height: calc(
    100vh - var(--top-tool-height) - var(--tags-view-height) - var(--app-footer-height) - 35px
  );
  overflow: auto;

  .form-scroll-area {
    display: flex;
    height: calc(
      100vh - var(--top-tool-height) - var(--tags-view-height) - var(--app-footer-height) - 35px -
        $process-header-height - 40px
    );
    max-height: calc(
      100vh - var(--top-tool-height) - var(--tags-view-height) - var(--app-footer-height) - 35px -
        $process-header-height - 40px
    );
    overflow: auto;
    flex-direction: column;

    :deep(.box-card) {
      height: 100%;
      flex: 1;

      .el-card__body {
        height: 100%;
        padding: 0;
      }
    }
  }
}

.form-box {
  :deep(.el-card) {
    border: none;
  }
}
</style>
