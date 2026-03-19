<template>
  <ContentWrap :body-style="{ padding: '0px' }" class="!mb-0">
    <div
      class="designer-wrapper h-[calc(100vh-var(--top-tool-height)-var(--tags-view-height)-var(--app-content-padding)-var(--app-content-padding)-2px)]"
      :class="{ 'relation-mode': relationPanelVisible }"
      @click.capture="handleDesignerClickCapture"
    >
      <fc-designer ref="designer" class="my-designer" :config="designerConfig">
        <template #handle>
          <el-button size="small" type="success" plain @click="handleSave">
            <Icon class="mr-5px" icon="ep:plus" />
            保存
          </el-button>
        </template>
      </fc-designer>

      <el-tooltip content="关联" placement="right" :hide-after="0">
        <div
          class="designer-relation-entry"
          :class="{ active: relationPanelVisible }"
          @click="handleToggleRelationPanel"
        >
          <i class="fc-icon icon-link"></i>
        </div>
      </el-tooltip>

      <div v-show="relationPanelVisible" class="designer-relation-panel">
        <div class="panel-title">关联表单</div>
        <el-input
          v-model="relationSearchName"
          class="mb-10px"
          placeholder="请输入流程名称"
          clearable
        >
          <template #prefix>
            <Icon icon="ep:search" />
          </template>
        </el-input>

        <el-table
          v-loading="relationPanelLoading"
          :data="filteredRelationDefinitionList"
          height="calc(100% - 72px)"
          @row-click="handleChooseRelatedDefinition"
        >
          <el-table-column label="流程名称" min-width="140" show-overflow-tooltip>
            <template #default="{ row }">
              {{ row.name }}
            </template>
          </el-table-column>
          <el-table-column label="流程分类" min-width="100" show-overflow-tooltip>
            <template #default="{ row }">
              {{ getCategoryName(row.category) }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="64" align="center">
            <template #default="{ row }">
              <el-button link type="primary" @click.stop="handleChooseRelatedDefinition(row)">
                添加
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>
  </ContentWrap>

  <Dialog v-model="dialogVisible" title="保存表单" width="600">
    <el-form ref="formRef" :model="formData" :rules="formRules" label-width="80px">
      <el-form-item label="表单名" prop="name">
        <el-input v-model="formData.name" placeholder="请输入表单名" />
      </el-form-item>
      <el-form-item label="状态" prop="status">
        <el-radio-group v-model="formData.status">
          <el-radio
            v-for="dict in getIntDictOptions(DICT_TYPE.COMMON_STATUS)"
            :key="dict.value"
            :value="dict.value"
          >
            {{ dict.label }}
          </el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="备注" prop="remark">
        <el-input v-model="formData.remark" placeholder="请输入备注" type="textarea" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button :disabled="formLoading" type="primary" @click="submitForm">确定</el-button>
      <el-button @click="dialogVisible = false">取消</el-button>
    </template>
  </Dialog>

  <el-dialog
    v-model="relationFieldDialogVisible"
    title="设置关联字段"
    width="560px"
    append-to-body
    destroy-on-close
  >
    <div v-loading="relationFieldLoading">
      <el-checkbox
        :model-value="relationFieldAllChecked"
        :indeterminate="relationFieldIndeterminate"
        @change="(value) => handleRelationFieldAllChange(!!value)"
      >
        全选
      </el-checkbox>

      <el-empty
        v-if="relationFieldOptions.length === 0"
        description="未获取到可关联字段"
        :image-size="100"
      />
      <el-checkbox-group v-else v-model="relationSelectedFields" class="mt-10px relation-field-list">
        <el-checkbox
          v-for="field in relationFieldOptions"
          :key="field.value"
          :value="field.value"
          class="!ml-0 mb-8px mr-12px"
        >
          {{ field.label }}
        </el-checkbox>
      </el-checkbox-group>
    </div>

    <template #footer>
      <el-button @click="relationFieldDialogVisible = false">取消</el-button>
      <el-button type="primary" @click="handleConfirmRelationFields">确定</el-button>
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>
import { DICT_TYPE, getIntDictOptions } from '@/utils/dict'
import { CommonStatusEnum, BpmModelFormType } from '@/utils/constants'
import * as FormApi from '@/api/bpm/form'
import * as DefinitionApi from '@/api/bpm/definition'
import { CategoryApi, type CategoryVO } from '@/api/bpm/category'
import { encodeConf, encodeFields, decodeFields, setConfAndFields } from '@/utils/formCreate'
import { useTagsViewStore } from '@/store/modules/tagsView'
import { useFormCreateDesigner } from '@/components/FormCreate'
import { useRoute } from 'vue-router'
import { createRelatedFormSelectRule } from '@/components/FormCreate/src/config'

defineOptions({ name: 'BpmFormEditor' })

interface FieldOption {
  label: string
  value: string
}

const { t } = useI18n()
const message = useMessage()
const route = useRoute()
const { push, currentRoute } = useRouter()
const { query } = route
const { delView } = useTagsViewStore()

const designerConfig = ref({
  switchType: [],
  autoActive: true,
  useTemplate: false,
  formOptions: {
    form: {
      labelWidth: '100px'
    }
  },
  fieldReadonly: false,
  hiddenDragMenu: false,
  hiddenDragBtn: false,
  hiddenMenu: [],
  hiddenItem: [],
  hiddenItemConfig: {},
  disabledItemConfig: {},
  showSaveBtn: false,
  showConfig: true,
  showBaseForm: true,
  showControl: true,
  showPropsForm: true,
  showEventForm: true,
  showValidateForm: true,
  showFormConfig: true,
  showInputData: true,
  showDevice: true,
  appendConfigData: []
})

const designer = ref()
useFormCreateDesigner(designer)

const dialogVisible = ref(false)
const formLoading = ref(false)
const formData = ref({
  name: '',
  status: CommonStatusEnum.ENABLE,
  remark: ''
})
const formRules = reactive({
  name: [{ required: true, message: '表单名不能为空', trigger: 'blur' }],
  status: [{ required: true, message: '启用状态不能为空', trigger: 'blur' }]
})
const formRef = ref()

const relationPanelVisible = ref(false)
const relationPanelLoading = ref(false)
const relationSearchName = ref('')
const relationDefinitionList = ref<any[]>([])
const relationCategoryList = ref<CategoryVO[]>([])

const relationFieldDialogVisible = ref(false)
const relationFieldLoading = ref(false)
const relationCurrentDefinition = ref<any>()
const relationFieldOptions = ref<FieldOption[]>([])
const relationSelectedFields = ref<string[]>([])

const categoryNameMap = computed(() => {
  const map = new Map<string, string>()
  relationCategoryList.value.forEach((item) => {
    map.set(item.code, item.name)
  })
  return map
})

const filteredRelationDefinitionList = computed(() => {
  const keyword = relationSearchName.value.trim().toLowerCase()
  if (!keyword) {
    return relationDefinitionList.value
  }
  return relationDefinitionList.value.filter((item) =>
    String(item?.name || '')
      .toLowerCase()
      .includes(keyword)
  )
})

const relationFieldAllChecked = computed(() => {
  if (relationFieldOptions.value.length === 0) {
    return false
  }
  return relationSelectedFields.value.length === relationFieldOptions.value.length
})

const relationFieldIndeterminate = computed(() => {
  return (
    relationSelectedFields.value.length > 0 &&
    relationSelectedFields.value.length < relationFieldOptions.value.length
  )
})

const getDesignerSetupState = () => designer.value?.setupState

const setDesignerActiveModule = (module: string) => {
  const setupState = getDesignerSetupState()
  if (!setupState) {
    return
  }
  setupState.activeModule = module
}

const loadRelationDefinitionList = async () => {
  relationPanelLoading.value = true
  try {
    const [categoryData, definitionData] = await Promise.all([
      CategoryApi.getCategorySimpleList(),
      DefinitionApi.getProcessDefinitionList({
        suspensionState: 1
      })
    ])
    relationCategoryList.value = categoryData || []
    relationDefinitionList.value = definitionData || []
  } catch {
    relationDefinitionList.value = []
    relationCategoryList.value = []
    message.error('加载关联表单列表失败')
  } finally {
    relationPanelLoading.value = false
  }
}

const getCategoryName = (categoryCode: string) => {
  return categoryNameMap.value.get(categoryCode) || '--'
}

const extractFieldOptions = (rules: any[]): FieldOption[] => {
  const options: FieldOption[] = []
  const seen = new Set<string>()

  const walk = (item: any) => {
    if (!item) {
      return
    }
    if (Array.isArray(item)) {
      item.forEach((node) => walk(node))
      return
    }
    if (typeof item !== 'object') {
      return
    }

    const field = typeof item.field === 'string' ? item.field.trim() : ''
    const title =
      (typeof item.title === 'string' && item.title.trim()) ||
      (typeof item.props?.label === 'string' && item.props.label.trim()) ||
      ''
    if (field && !seen.has(field)) {
      seen.add(field)
      options.push({
        label: title || '未命名字段',
        value: field
      })
    }

    if (Array.isArray(item.children)) {
      walk(item.children)
    }
    if (Array.isArray(item.control)) {
      item.control.forEach((controlItem: any) => {
        if (controlItem?.rule) {
          walk(controlItem.rule)
        }
      })
    }
  }

  walk(rules)
  return options
}

const loadDefinitionFieldOptions = async (definitionId: string | number) => {
  const detail = await DefinitionApi.getProcessDefinition(String(definitionId))
  if (!detail || Number(detail.formType) !== BpmModelFormType.NORMAL) {
    return []
  }
  let decodedFields: any[] = []
  try {
    decodedFields = decodeFields(detail.formFields || [])
  } catch {
    decodedFields = []
  }
  return extractFieldOptions(decodedFields)
}

const handleToggleRelationPanel = async () => {
  if (relationPanelVisible.value) {
    relationPanelVisible.value = false
    setDesignerActiveModule('base')
    return
  }
  relationPanelVisible.value = true
  setDesignerActiveModule('base')
  if (relationDefinitionList.value.length === 0) {
    await loadRelationDefinitionList()
  }
}

const handleChooseRelatedDefinition = async (row: any) => {
  relationCurrentDefinition.value = row
  relationFieldDialogVisible.value = true
  relationFieldLoading.value = true
  try {
    relationFieldOptions.value = await loadDefinitionFieldOptions(row.id)
    relationSelectedFields.value = []
  } catch {
    relationFieldOptions.value = []
    relationSelectedFields.value = []
    message.error('加载关联字段失败')
  } finally {
    relationFieldLoading.value = false
  }
}

const handleRelationFieldAllChange = (checked: boolean) => {
  relationSelectedFields.value = checked ? relationFieldOptions.value.map((item) => item.value) : []
}

const handleConfirmRelationFields = () => {
  if (!relationCurrentDefinition.value) {
    return
  }
  const payload = {
    title: `关联表单(${relationCurrentDefinition.value.name})`,
    relatedDefinitionId: relationCurrentDefinition.value.id,
    relatedDefinitionKey: relationCurrentDefinition.value.key,
    relatedDefinitionName: relationCurrentDefinition.value.name,
    relatedFields: relationSelectedFields.value,
    relatedFieldOptions: relationFieldOptions.value
  }
  const newRule = createRelatedFormSelectRule(payload)
  const currentRules = designer.value?.getRule() || []
  currentRules.push(newRule)
  designer.value?.setRule(currentRules)
  relationFieldDialogVisible.value = false
  relationPanelVisible.value = false
  setDesignerActiveModule('base')
  message.success('关联表单组件已添加')
}

const handleDesignerClickCapture = (event: MouseEvent) => {
  if (!relationPanelVisible.value) {
    return
  }
  const target = event.target as HTMLElement | null
  if (!target) {
    return
  }
  if (target.closest('.designer-relation-entry') || target.closest('.designer-relation-panel')) {
    return
  }
  if (target.closest('._fc-l-menu-item') || target.closest('._fc-l-tab')) {
    relationPanelVisible.value = false
  }
}

const handleSave = () => {
  dialogVisible.value = true
}

const submitForm = async () => {
  if (!formRef.value) {
    return
  }
  const valid = await formRef.value.validate()
  if (!valid) {
    return
  }

  formLoading.value = true
  try {
    const data = formData.value as FormApi.FormVO
    data.conf = encodeConf(designer)
    data.fields = encodeFields(designer)
    if (!data.id) {
      await FormApi.createForm(data)
      message.success(t('common.createSuccess'))
    } else {
      await FormApi.updateForm(data)
      message.success(t('common.updateSuccess'))
    }
    dialogVisible.value = false
    close()
  } finally {
    formLoading.value = false
  }
}

const close = () => {
  delView(unref(currentRoute))
  push('/bpm/manager/form')
}

onMounted(async () => {
  await nextTick()

  const id = query.id as unknown as number
  if (!id) {
    return
  }

  const data = await FormApi.getForm(id)
  formData.value = data
  setConfAndFields(designer, data.conf, data.fields)

  if (route.query.type !== 'copy') {
    return
  }
  const { id: currentId, ...copied } = data
  void currentId
  formData.value = copied
  formData.value.name += '_copy'
})
</script>

<style lang="scss">
.my-designer {
  ._fc-l,
  ._fc-m,
  ._fc-r {
    border-top: none;
  }
}

.designer-wrapper {
  position: relative;

  &.relation-mode {
    ._fc-l {
      visibility: hidden;
      pointer-events: none;
    }
  }

  .designer-relation-entry {
    position: absolute;
    left: 0;
    top: 120px;
    z-index: 5;
    display: flex;
    width: 40px;
    height: 40px;
    cursor: pointer;
    background: #fff;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;

    &.active {
      color: #2e73ff;
      background: #ecf5ff;

      .fc-icon {
        color: #2e73ff;
      }
    }
  }

  .designer-relation-panel {
    position: absolute;
    top: 0;
    left: 40px;
    z-index: 4;
    display: flex;
    width: 266px;
    height: 100%;
    padding: 12px;
    background: #fff;
    border-right: 1px solid var(--el-border-color-light);
    flex-direction: column;
    box-sizing: border-box;

    .panel-title {
      margin-bottom: 10px;
      font-size: 14px;
      font-weight: 600;
    }
  }
}

.relation-field-list {
  max-height: 320px;
  overflow: auto;
}
</style>
