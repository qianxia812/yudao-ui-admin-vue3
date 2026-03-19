<template>
  <el-form ref="formRef" :model="condition" :rules="formRules" label-position="top">
    <el-form-item label="配置方式" prop="conditionType">
      <el-radio-group v-model="condition.conditionType" @change="changeConditionType">
        <el-radio
          v-for="(dict, indexConditionType) in conditionConfigTypes"
          :key="indexConditionType"
          :value="dict.value"
          :label="dict.value"
        >
          {{ dict.label }}
        </el-radio>
      </el-radio-group>
    </el-form-item>
    <el-form-item
      v-if="condition.conditionType === ConditionType.RULE && condition.conditionGroups"
      label="条件规则"
    >
      <div class="condition-group-tool">
        <div class="flex items-center">
          <div class="mr-4">条件组关系</div>
          <el-switch
            v-model="condition.conditionGroups.and"
            inline-prompt
            active-text="且"
            inactive-text="或"
          />
        </div>
      </div>
      <el-space direction="vertical" :spacer="condition.conditionGroups.and ? '且' : '或'">
        <el-card
          class="condition-group"
          style="width: 530px"
          v-for="(equation, cIdx) in condition.conditionGroups.conditions"
          :key="cIdx"
        >
          <div
            class="condition-group-delete"
            v-if="condition.conditionGroups.conditions.length > 1"
          >
            <Icon
              color="#0089ff"
              icon="ep:circle-close-filled"
              :size="18"
              @click="deleteConditionGroup(condition.conditionGroups.conditions, cIdx)"
            />
          </div>
          <template #header>
            <div class="flex items-center justify-between">
              <div>条件组</div>
              <div class="flex">
                <div class="mr-4">规则关系</div>
                <el-switch
                  v-model="equation.and"
                  inline-prompt
                  active-text="且"
                  inactive-text="或"
                />
              </div>
            </div>
          </template>

          <div class="flex pt-2" v-for="(rule, rIdx) in equation.rules" :key="rIdx">
            <div class="mr-2">
              <el-form-item
                :prop="`conditionGroups.conditions.${cIdx}.rules.${rIdx}.leftSide`"
                :rules="{
                  required: true,
                  message: '左值不能为空',
                  trigger: 'change'
                }"
              >
                <el-select
                  style="width: 160px"
                  v-model="rule.leftSide"
                  clearable
                  @change="handleLeftSideChange(rule)"
                >
                  <el-option
                    v-for="(field, fIdx) in fieldOptions"
                    :key="fIdx"
                    :label="field.title"
                    :value="field.field"
                    :disabled="!field.required"
                  >
                    <el-tooltip
                      content="表单字段非必填时不能作为流程分支条件"
                      effect="dark"
                      placement="right-start"
                      v-if="!field.required"
                    >
                      <span>{{ field.title }}</span>
                    </el-tooltip>
                  </el-option>
                </el-select>
              </el-form-item>
            </div>
            <div class="mr-2">
              <el-select v-model="rule.opCode" style="width: 100px" @change="handleOpCodeChange(rule)">
                <el-option
                  v-for="operator in getOperatorOptions(rule.leftSide)"
                  :key="operator.value"
                  :label="operator.label"
                  :value="operator.value"
                />
              </el-select>
            </div>
            <div class="mr-2">
              <el-form-item
                :prop="`conditionGroups.conditions.${cIdx}.rules.${rIdx}.rightSide`"
                :rules="{
                  required: true,
                  message: '右值不能为空',
                  trigger: 'blur'
                }"
              >
                <el-input v-if="!isStartUserContainsRule(rule)" v-model="rule.rightSide" style="width: 160px" />
                <el-input
                  v-else
                  :model-value="getStartUserDisplayText(rule.rightSide)"
                  style="width: 160px"
                  readonly
                  placeholder="点击选择人员"
                  @click="openStartUserSelector(rule)"
                >
                  <template #append>
                    <el-button link @click="openStartUserSelector(rule)">选择</el-button>
                  </template>
                </el-input>
              </el-form-item>
            </div>
            <div class="mr-1 flex items-center" v-if="equation.rules.length > 1">
              <Icon icon="ep:delete" :size="18" @click="deleteConditionRule(equation, rIdx)" />
            </div>
            <div class="flex items-center">
              <Icon icon="ep:plus" :size="18" @click="addConditionRule(equation, rIdx)" />
            </div>
          </div>
        </el-card>
      </el-space>
      <div title="添加条件组" class="mt-4 cursor-pointer">
        <Icon
          color="#0089ff"
          icon="ep:plus"
          :size="24"
          @click="addConditionGroup(condition.conditionGroups?.conditions)"
        />
      </div>
    </el-form-item>
    <el-form-item
      v-if="condition.conditionType === ConditionType.EXPRESSION"
      label="条件表达式"
      prop="conditionExpression"
    >
      <el-input
        type="textarea"
        v-model="condition.conditionExpression"
        clearable
        style="width: 100%"
      />
    </el-form-item>
  </el-form>
  <UserSelectForm ref="userSelectFormRef" @confirm="handleStartUserSelectConfirm" />
</template>

<script setup lang="ts">
import {
  COMPARISON_OPERATORS,
  CONDITION_CONFIG_TYPES,
  ConditionType,
  DEFAULT_CONDITION_GROUP_VALUE,
  ProcessVariableEnum
} from '../../consts'
import { BpmModelFormType } from '@/utils/constants'
import { useFormFieldsAndStartUser } from '../../node'
import { cloneDeep } from 'lodash-es'
import UserSelectForm from '@/components/UserSelectForm/index.vue'
import * as UserApi from '@/api/system/user'

const props = defineProps({
  modelValue: {
    type: Object,
    required: true
  }
})
const emit = defineEmits(['update:modelValue'])
const condition = computed({
  get() {
    return props.modelValue
  },
  set(newValue) {
    emit('update:modelValue', newValue)
  }
})

const normalizeConditionRules = () => {
  const conditionGroups = condition.value?.conditionGroups?.conditions
  if (!conditionGroups || !Array.isArray(conditionGroups)) {
    return
  }
  conditionGroups.forEach((group) => {
    group?.rules?.forEach((rule) => {
      if (!rule.leftSide) {
        rule.leftSide = ProcessVariableEnum.START_USER_ID
      }
    })
  })
}

watch(
  () => props.modelValue,
  () => {
    normalizeConditionRules()
  },
  { immediate: true }
)
const formType = inject<Ref<number>>('formType') // 表单类型
const conditionConfigTypes = computed(() => {
  return CONDITION_CONFIG_TYPES.filter((item) => {
    // 业务表单暂时去掉条件规则选项
    if (formType?.value === BpmModelFormType.CUSTOM && item.value === ConditionType.RULE) {
      return false
    } else {
      return true
    }
  })
})

/** 条件规则可选择的表单字段 */
const fieldOptions = useFormFieldsAndStartUser()
const userOptions = inject<Ref<UserApi.UserVO[]>>('userList', ref([]))
const userSelectFormRef = ref()
const currentSelectRule = ref<any>()

const getOperatorOptions = (leftSide: string) => {
  if (leftSide === ProcessVariableEnum.START_USER_ID) {
    return COMPARISON_OPERATORS
  }
  return COMPARISON_OPERATORS.filter((item: any) => item.value !== 'contains')
}

const isStartUserContainsRule = (rule: any) => {
  return rule?.leftSide === ProcessVariableEnum.START_USER_ID && rule?.opCode === 'contains'
}

const parseStartUserIds = (rightSide?: string): number[] => {
  if (!rightSide) {
    return []
  }
  return rightSide
    .split(',')
    .map((item) => Number(item))
    .filter((item) => !Number.isNaN(item))
}

const getSelectedStartUsers = (rightSide?: string): UserApi.UserVO[] => {
  const userIds = new Set(parseStartUserIds(rightSide))
  return userOptions.value.filter((user) => userIds.has(user.id))
}

const getStartUserDisplayText = (rightSide?: string) => {
  const users = getSelectedStartUsers(rightSide)
  if (users.length <= 0) {
    return rightSide || ''
  }
  return users.map((user) => user.nickname).join(',')
}

const openStartUserSelector = (rule: any) => {
  currentSelectRule.value = rule
  userSelectFormRef.value?.open(0, getSelectedStartUsers(rule.rightSide))
}

const handleStartUserSelectConfirm = (_id: number, users: UserApi.UserVO[]) => {
  if (!currentSelectRule.value) {
    return
  }
  currentSelectRule.value.rightSide = users.map((user) => user.id).join(',')
}

const handleLeftSideChange = (rule: any) => {
  if (rule.leftSide !== ProcessVariableEnum.START_USER_ID && rule.opCode === 'contains') {
    rule.opCode = '=='
    rule.rightSide = ''
  }
}

const handleOpCodeChange = (rule: any) => {
  if (rule.opCode !== 'contains') {
    return
  }
  if (rule.leftSide !== ProcessVariableEnum.START_USER_ID) {
    rule.opCode = '=='
    return
  }
  openStartUserSelector(rule)
}

// 表单校验规则
const formRules = reactive({
  conditionType: [{ required: true, message: '配置方式不能为空', trigger: 'blur' }],
  conditionExpression: [{ required: true, message: '条件表达式不能为空', trigger: 'blur' }]
})
const formRef = ref() // 表单 Ref

/** 切换条件配置方式 */
const changeConditionType = () => {
  if (condition.value.conditionType === ConditionType.RULE) {
    if (!condition.value.conditionGroups) {
      condition.value.conditionGroups = cloneDeep(DEFAULT_CONDITION_GROUP_VALUE)
    }
    normalizeConditionRules()
  }
}
const deleteConditionGroup = (conditions, index) => {
  conditions.splice(index, 1)
}

const deleteConditionRule = (condition, index) => {
  condition.rules.splice(index, 1)
}

const addConditionRule = (condition, index) => {
  const rule = {
    opCode: '==',
    leftSide: ProcessVariableEnum.START_USER_ID,
    rightSide: ''
  }
  condition.rules.splice(index + 1, 0, rule)
}

const addConditionGroup = (conditions) => {
  const condition = {
    and: false,
    rules: [
      {
        opCode: '==',
        leftSide: ProcessVariableEnum.START_USER_ID,
        rightSide: ''
      }
    ]
  }
  conditions.push(condition)
}

const validate = async () => {
  if (!formRef) return false
  return await formRef.value.validate()
}

defineExpose({ validate })
</script>

<style lang="scss" scoped>
.condition-group-tool {
  display: flex;
  justify-content: space-between;
  width: 500px;
  margin-bottom: 20px;
}

.condition-group {
  position: relative;

  &:hover {
    border-color: #0089ff;

    .condition-group-delete {
      opacity: 1;
    }
  }

  .condition-group-delete {
    position: absolute;
    top: 0;
    left: 0;
    display: flex;
    cursor: pointer;
    opacity: 0;
  }
}

::v-deep(.el-card__header) {
  padding: 8px var(--el-card-padding);
  border-bottom: 1px solid var(--el-card-border-color);
  box-sizing: border-box;
}
</style>
