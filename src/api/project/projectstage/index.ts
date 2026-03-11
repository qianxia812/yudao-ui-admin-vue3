import request from '@/config/axios'

/** 项目阶段列表查询参数 */
export interface StagePageReqVO {
  pageNo: number
  pageSize: number
  projectCode?: string
  projectName?: string
  projectStatus?: number
  stageName?: string
  stageStatus?: number
  relationType?: string
  latestStartTime?: string[]
  latestEndTime?: string[]
}

/** 当前审批人（接口 assignee 字段） */
export interface StageAssigneeVO {
  id?: number
  nickname?: string
  status?: number
  deptId?: number
  postIds?: number[]
  mobile?: string
  avatar?: string
}

/** 当前任务信息（接口 taskInfos 字段） */
export interface StageTaskInfoVO {
  taskId?: string
  assignee?: string | number
}

/** 项目阶段列表项 */
export interface StageVO {
  id?: number
  projectId?: number
  processInstanceId?: string | number
  latestProcessInstanceId?: string | number
  currentProcessInstanceId?: string | number
  nextProcessInstanceId?: string | number
  processDefinitionId?: string | number
  latestProcessDefinitionId?: string | number
  currentProcessDefinitionId?: string | number
  nextProcessDefinitionId?: string | number
  processDefinitionKey?: string
  latestProcessDefinitionKey?: string
  currentProcessDefinitionKey?: string
  nextProcessDefinitionKey?: string
  projectCode?: string
  projectName?: string
  projectStatus?: number
  stageName?: string
  stageStatus?: number
  latestStarterUserId?: number
  latestStarterUserName?: string
  latestApproverUserName?: string
  relationType?: string
  relationTypeLabel?: string
  latestStartTime?: string
  latestEndTime?: string | null
  assignee?: StageAssigneeVO[] | null
  taskInfos?: StageTaskInfoVO[] | null
  projectPrice?: number | string
  projectQuote?: number | string
  remark?: string
}

/** 项目维护表单 */
export interface StageFormVO {
  id?: number
  projectCode?: string
  projectName?: string
  projectPrice?: number | string
  projectQuote?: number | string
  remark?: string
}

/** 项目详情 */
export interface ProjectDetailVO {
  id?: number
  projectCode?: string
  projectName?: string
  projectStatus?: number
  projectPrice?: number | string
  projectQuote?: number | string
  remark?: string
  archiveReason?: string
}

/** 阶段分组 */
export interface StageGroupVO {
  stageGroup?: string
  stageGroupCode?: string
  stageStatus?: number
  sort?: number
}

/** 版本流程条目 */
export interface StageVersionVO {
  id?: number
  stageCode?: string
  stageName?: string
  versionNo?: number
  startType?: number
  processInstanceId?: string | number
  processDefinitionId?: string | number
  processDefinitionKey?: string
  status?: number
  starterUserId?: number
  starterUserName?: string
  currentAssigneeUserName?: string
  startTime?: string
  endTime?: string | null
}

/** 时间轴阶段分组 */
export interface StageTimelineVO {
  stageCode?: string
  stageName?: string
  versions?: StageVersionVO[]
}

// 项目阶段 API
export const StageApi = {
  // 查询项目阶段分页
  getStagePage: async (params: StagePageReqVO) => {
    return await request.get({ url: '/project/stage/page', params })
  },

  // 查询项目详情（用于新增/编辑弹窗）
  getStage: async (id: number) => {
    return await request.get({ url: '/project/stage/get?id=' + id })
  },

  // 新增项目
  createStage: async (data: StageFormVO) => {
    return await request.post({ url: '/project/stage/create', data })
  },

  // 修改项目
  updateStage: async (data: StageFormVO) => {
    return await request.put({ url: '/project/stage/update', data })
  },

  // 取消流程
  cancelStage: async (data: { id: number; reason: string }) => {
    return await request.put({ url: '/project/stage/cancel', data })
  },

  // 归档项目
  archiveStage: async (data: { id: number; reason: string }) => {
    return await request.put({ url: '/project/stage/archive', data })
  },

  // 获取项目详情（项目阶段详情页）
  getProjectDetail: async (id: number) => {
    return await request.get<ProjectDetailVO>({
      url: '/project/stage-instance/project-detail',
      params: { id }
    })
  },

  // 获取项目阶段分组列表
  getProjectGroupList: async (projectId: number) => {
    return await request.get<StageGroupVO[]>({
      url: '/project/stage-instance/project-group-list',
      params: { projectId }
    })
  },

  // 获取分组时间轴
  getStageTimeline: async (projectId: number, selectedGroupCode: string) => {
    return await request.get<StageTimelineVO[]>({
      url: '/project/stage-instance/timeline',
      params: { projectId, selectedGroupCode }
    })
  }
}
