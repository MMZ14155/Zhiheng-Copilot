export interface ProjectListItem { id: string; name: string; code: string; customerName: string; status: 'active' | 'archived' | 'completed'; progress: number; contractAmount: number | null; signedDate: string | null; plannedDeliveryDate: string | null; updatedAt: string }
export interface ProjectList { page: number; size: number; total: number; items: ProjectListItem[] }
