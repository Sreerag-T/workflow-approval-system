import { createApi } from '@reduxjs/toolkit/query/react';
import { http, errMsg } from './http';

// RTK Query using Axios as the transport (all data comes from the backend REST API)
const axiosBaseQuery = () => async ({ url, method = 'get', data, params }) => {
  try {
    const res = await http({ url, method, data, params });
    return { data: res.data };
  } catch (e) {
    return { error: { status: e.response?.status, message: errMsg(e), details: e.response?.data?.details } };
  }
};

const ALL = ['Request', 'Approval', 'Dashboard', 'Notif'];
const m = (b, query, tags = ALL) => b.mutation({ query, invalidatesTags: tags });

export const api = createApi({
  reducerPath: 'api',
  baseQuery: axiosBaseQuery(),
  tagTypes: ['Request', 'Approval', 'Dashboard', 'Workflow', 'User', 'Type', 'Notif', 'Report'],
  endpoints: (b) => ({
    login: b.mutation({ query: (data) => ({ url: '/auth/login', method: 'post', data }) }),

    getDashboard: b.query({ query: () => ({ url: '/dashboard' }), providesTags: ['Dashboard'] }),

    getRequests: b.query({ query: (params) => ({ url: '/requests', params }), providesTags: ['Request'] }),
    getRequest: b.query({ query: (id) => ({ url: `/requests/${id}` }), providesTags: ['Request'] }),
    createRequest: m(b, (data) => ({ url: '/requests', method: 'post', data })),
    updateRequest: m(b, ({ id, ...data }) => ({ url: `/requests/${id}`, method: 'put', data })),
    submitRequest: m(b, (id) => ({ url: `/requests/${id}/submit`, method: 'post' })),
    cancelRequest: m(b, (id) => ({ url: `/requests/${id}/cancel`, method: 'post' })),
    uploadFiles: m(b, ({ id, formData }) => ({ url: `/requests/${id}/attachments`, method: 'post', data: formData })),
    deleteAttachment: m(b, ({ id, attId }) => ({ url: `/requests/${id}/attachments/${attId}`, method: 'delete' })),

    getPending: b.query({ query: () => ({ url: '/approvals/pending' }), providesTags: ['Approval'] }),
    getMyHistory: b.query({ query: () => ({ url: '/approvals/history' }), providesTags: ['Approval'] }),
    actOnApproval: m(b, ({ id, ...data }) => ({ url: `/approvals/${id}/action`, method: 'post', data })),
    runEscalation: m(b, () => ({ url: '/approvals/escalate-now', method: 'post' })),

    getWorkflows: b.query({ query: () => ({ url: '/workflows' }), providesTags: ['Workflow'] }),
    getWorkflowVersions: b.query({ query: (id) => ({ url: `/workflows/${id}/versions` }), providesTags: ['Workflow'] }),
    createWorkflow: m(b, (data) => ({ url: '/workflows', method: 'post', data }), ['Workflow']),
    updateWorkflow: m(b, ({ id, ...data }) => ({ url: `/workflows/${id}`, method: 'put', data }), ['Workflow']),
    toggleWorkflow: m(b, ({ id, is_active }) => ({ url: `/workflows/${id}/status`, method: 'patch', data: { is_active } }), ['Workflow']),

    getTypes: b.query({ query: () => ({ url: '/request-types' }), providesTags: ['Type'] }),
    createType: m(b, (data) => ({ url: '/request-types', method: 'post', data }), ['Type']),
    updateType: m(b, ({ id, ...data }) => ({ url: `/request-types/${id}`, method: 'put', data }), ['Type']),

    getUsers: b.query({ query: () => ({ url: '/users' }), providesTags: ['User'] }),
    getRoles: b.query({ query: () => ({ url: '/users/roles' }) }),
    createUser: m(b, (data) => ({ url: '/users', method: 'post', data }), ['User']),
    updateUser: m(b, ({ id, ...data }) => ({ url: `/users/${id}`, method: 'put', data }), ['User']),

    getNotifications: b.query({ query: () => ({ url: '/notifications' }), providesTags: ['Notif'] }),
    readAllNotifications: m(b, () => ({ url: '/notifications/read-all', method: 'post' }), ['Notif']),

    getApprovalReport: b.query({ query: () => ({ url: '/reports/approval-history' }), providesTags: ['Request', 'Report'] }),
    getAuditLogs: b.query({ query: () => ({ url: '/reports/audit-logs' }), providesTags: ['Request', 'Report'] }),
  }),
});

export const {
  useLoginMutation, useGetDashboardQuery, useGetRequestsQuery, useGetRequestQuery, useCreateRequestMutation, useUpdateRequestMutation,
  useSubmitRequestMutation, useCancelRequestMutation, useUploadFilesMutation, useDeleteAttachmentMutation, useGetPendingQuery,
  useGetMyHistoryQuery, useActOnApprovalMutation, useRunEscalationMutation, useGetWorkflowsQuery, useGetWorkflowVersionsQuery,
  useCreateWorkflowMutation, useUpdateWorkflowMutation, useToggleWorkflowMutation, useGetTypesQuery, useCreateTypeMutation,
  useUpdateTypeMutation, useGetUsersQuery, useGetRolesQuery, useCreateUserMutation, useUpdateUserMutation, useGetNotificationsQuery,
  useReadAllNotificationsMutation, useGetApprovalReportQuery, useGetAuditLogsQuery,
} = api;
