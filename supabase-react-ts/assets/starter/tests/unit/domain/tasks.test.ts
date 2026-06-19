import { describe, expect, it } from 'vitest'
import type { Task } from '../../../common/appTypes'
import { openTaskCount, sortTasks, taskStatusLabel } from '../../../src/domain/tasks'

const task = (id: string, status: Task['status'], createdDate: string): Task => ({
  id,
  workspaceId: 'workspace-1',
  title: id,
  notes: '',
  status,
  createdDate
})

describe('tasks domain rules', () => {
  it('counts open tasks', () => {
    expect(openTaskCount([
      task('one', 'open', '2026-06-01'),
      task('two', 'done', '2026-06-02'),
      task('three', 'open', '2026-06-03')
    ])).toBe(2)
  })

  it('sorts open tasks before completed tasks and then by creation date', () => {
    expect(sortTasks([
      task('done', 'done', '2026-06-01'),
      task('new-open', 'open', '2026-06-03'),
      task('old-open', 'open', '2026-06-02')
    ]).map((item) => item.id)).toEqual(['old-open', 'new-open', 'done'])
  })

  it('labels task status for the UI', () => {
    expect(taskStatusLabel('open')).toBe('Open')
    expect(taskStatusLabel('done')).toBe('Done')
  })
})
