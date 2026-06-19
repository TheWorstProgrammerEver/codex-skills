const pad = (value: number) => value.toString().padStart(2, '0')

export const toLocalIsoDate = (date: Date) => (
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
)

export const todayIso = () => toLocalIsoDate(new Date())
