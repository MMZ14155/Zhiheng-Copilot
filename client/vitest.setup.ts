import { vi } from 'vitest'
import '@testing-library/dom'

// 静默 src/core 源文件末尾内联断言在 import 时产生的 console.log 输出，
// 不删除源文件内联断言，仅避免污染测试控制台。
vi.spyOn(console, 'log').mockImplementation(() => {})

if (typeof window !== 'undefined') {
  Element.prototype.scrollIntoView = vi.fn()
}
