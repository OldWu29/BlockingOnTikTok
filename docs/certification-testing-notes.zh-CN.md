# 审核测试说明（Certification Testing Notes）

> 适用于 Microsoft Edge Add-ons Partner Center 的 **Certification testing notes** 字段，也可供 Chrome Web Store 审核参考。  
> 将下方「可直接粘贴」整段复制到商店后台即可；版本号请与 `manifest.json` 保持一致。

---

## 可直接粘贴（简体中文）

```
【扩展名称】抖音一键拉黑 v1.2.3

【单一用途】
在抖音网页版帮助已登录用户一键拉黑或解除拉黑当前视频/直播作者，并在浏览器本地管理黑名单。不向开发者服务器上传数据。

【是否需要测试账号】
是。必须使用已登录的抖音网页版账号。请审核人员使用自有抖音账号扫码或手机号登录 https://www.douyin.com 后测试。扩展不会收集或存储抖音账号密码。

【测试网站】
- https://www.douyin.com（推荐页、视频详情页，主要测试场景）
- https://live.douyin.com（直播房间页，可选）
- https://www.douyin.com/live（网页版直播入口，可选）

【界面说明（审核员请先读）】
1. 页面右下角浮动按钮：文案固定为「切换拉黑状态」，深色样式，不因拉黑状态变色。
2. 扩展弹窗：仅有一个主操作按钮「切换拉黑状态」（非两个分开的拉黑/解除按钮）。
3. 自动切换逻辑：点击按钮时会先识别当前作者，再根据本地黑名单判断是否已拉黑——已拉黑则解除，未拉黑则拉黑。无需用户手动选择操作类型。
4. 拉黑状态展示：弹窗作者卡片右侧显示「已拉黑」徽章（未拉黑时不显示）；按钮本身不变色。
5. 黑名单管理：弹窗右上角「黑名单」链接，或扩展详情页「扩展选项」。

【测试步骤 A：视频页切换拉黑状态（必测）】
1. 安装扩展后打开 https://www.douyin.com 并完成登录
2. 在推荐页播放任意视频（确保视频处于播放状态）
3. 确认页面右下角出现深色浮动按钮「切换拉黑状态」
4. 点击浮动按钮（首次点击会先提示「正在识别作者...」）
5. 确认页面顶部出现成功提示，例如「已拉黑：作者昵称」
6. 再次点击同一浮动按钮（无需换按钮）
7. 确认出现「已解除拉黑：作者昵称」提示
8. 打开扩展弹窗验证：
   - 显示当前作者昵称与 sec_uid
   - 未拉黑时不显示「已拉黑」徽章；拉黑后显示徽章
   - 主按钮始终为「切换拉黑状态」，样式为深色，不随状态变色

【测试步骤 B：扩展弹窗（必测）】
1. 在抖音视频页点击浏览器工具栏中的扩展图标
2. 若显示「未识别到作者」，点击「刷新作者信息」，或等待 1～2 秒后重试
3. 点击「切换拉黑状态」，确认顶部状态栏提示拉黑或解除成功
4. 再次点击同一按钮，确认执行相反操作（自动识别后切换）
5. 点击右上角「黑名单」，验证列表、搜索、解除拉黑、清空记录

【测试步骤 C：直播场景（建议测试）】
1. 保持抖音登录状态，打开 https://live.douyin.com 任意直播间
   或在 www.douyin.com 推荐流中进入正在直播的作者
2. 确认出现「切换拉黑状态」浮动按钮
3. 打开扩展弹窗，应能识别当前主播（必要时点「刷新作者信息」）
4. 通过浮动按钮或弹窗执行拉黑与解除，行为应与视频页一致

【测试步骤 D：快捷键（可选）】
- Ctrl+Shift+B：强制拉黑当前作者（不自动切换）
- Ctrl+Shift+U：强制解除拉黑当前作者（不自动切换）
可在 edge://extensions/shortcuts 中查看或修改绑定

【网络与数据说明】
- 扩展仅在用户主动操作时向抖音官方域名发起请求：
  - www-hj.douyin.com：拉黑 / 解除拉黑接口（POST）
  - live.douyin.com：直播房间信息（识别主播，非开发者服务器）
  - www.douyin.com：用户资料接口（识别作者昵称）
- 不向开发者自有服务器发送任何请求
- 黑名单保存在 chrome.storage.local，仅本机存储
- 不包含远程代码，所有脚本打包在扩展内（Manifest V3）

【权限摘要】
- storage：本地保存黑名单
- activeTab：用户打开弹窗或使用快捷键时访问当前标签页
- tabs：向抖音页面内容脚本发消息；黑名单页解除拉黑时查找抖音标签页
- www.douyin.com / live.douyin.com：注入脚本、识别作者、显示 UI
- www-hj.douyin.com：调用抖音官方拉黑 API

【已知限制】
- 未登录抖音时操作失败，提示需确认已登录
- 页面刚打开或未播放视频时，可能暂时无法识别作者；可点弹窗「刷新作者信息」或等待 1～2 秒后重试
- 推荐流中「视频作者正在直播」场景，首次识别可能需要短暂等待接口响应
- 「已拉黑」状态依据扩展本地黑名单判断；若用户曾在抖音 App 内拉黑但未通过本扩展记录，首次点击可能执行拉黑而非解除
- 本扩展为第三方工具，与抖音/字节跳动无官方关联；接口变更可能导致功能暂时不可用

【联系方式】
审核问题请联系：15201652129x@sina.com
项目主页：https://github.com/OldWu29/BlockingOnTikTok
隐私政策：https://github.com/OldWu29/BlockingOnTikTok/blob/main/docs/privacy-policy.zh-CN.md
```

---

## 英文简版（可选粘贴）

```
Extension: Douyin Block Author v1.2.3

Purpose: Let logged-in users block/unblock the current video or live stream author on Douyin web, with a local blacklist. No data is sent to the developer's servers.

Test account: Required. Log in at https://www.douyin.com with any Douyin account.

UI notes for reviewers:
- Floating button (bottom-right): always labeled "切换拉黑状态" (toggle block state), dark style, does not change color.
- Popup: single "切换拉黑状态" button — not separate Block/Unblock buttons.
- On click: extension identifies the current author, checks local blacklist, then blocks if not blocked or unblocks if blocked.

Main test (www.douyin.com):
1. Install extension, open douyin.com, log in, play a video
2. Click the floating toggle button → confirm "blocked" toast
3. Click the same button again → confirm "unblocked" toast
4. Open extension popup — verify author info and "已拉黑" badge when blocked
5. Use popup toggle button for the same block/unblock flow
6. Open "黑名单" (blacklist) — verify list, search, unblock, clear

Optional: Test on https://live.douyin.com with the same flow.

Shortcuts (optional): Ctrl+Shift+B = block, Ctrl+Shift+U = unblock (explicit, not auto-toggle).

Permissions: storage (local blacklist), activeTab/tabs (communicate with current tab on user action), host permissions for douyin.com / live.douyin.com (inject scripts) and www-hj.douyin.com (official block API only on user action).

Support: 15201652129x@sina.com
Repo: https://github.com/OldWu29/BlockingOnTikTok
```

---

## 审核员快速检查表

| 检查项 | 预期结果 |
|--------|----------|
| 非 douyin.com / live.douyin.com 页面 | 无浮动按钮；扩展弹窗提示打开抖音 |
| 未登录抖音 | 操作失败，提示需登录 |
| 视频页浮动按钮 | 右下角深色「切换拉黑状态」，可重复点击切换状态 |
| 浮动按钮样式 | 不因拉黑/未拉黑变色 |
| 扩展弹窗 | 单一「切换拉黑状态」按钮；已拉黑时显示徽章 |
| 自动切换逻辑 | 未拉黑时点击→拉黑；已拉黑时点击→解除 |
| 黑名单页 | 列表、搜索、解除、清空可用 |
| 快捷键 | Ctrl+Shift+B 强制拉黑；Ctrl+Shift+U 强制解除 |
| 远程代码 | 无；MV3 本地打包脚本 |
| 开发者服务器 | 无请求 |

---

## 测试场景矩阵（建议自测）

| 场景 | 操作 | 预期 |
|------|------|------|
| 推荐流视频 | 点浮动按钮两次 | 先拉黑再解除 |
| 推荐流视频 | 弹窗点切换按钮 | 与浮动按钮行为一致 |
| 作者正在直播 | 浮动按钮解除拉黑 | 能识别主播并成功解除 |
| 刚打开页面 | 立即点按钮 | 可能提示未识别；刷新或稍候后成功 |
| 黑名单页 | 解除拉黑 | 抖音接口成功且本地记录删除 |
| 黑名单页 | 仅删记录 | 仅删本地，不调用抖音接口 |

---

## 本地自测（提交前）

```powershell
# 打包
.\scripts\package.ps1

# 在 edge://extensions/ 加载解压缩扩展（选含 manifest.json 的根目录）
# 完整走一遍测试步骤 A + B；有条件再测 C
```

自测检查项：

- [ ] 浮动按钮文案为「切换拉黑状态」，深色不变色
- [ ] 同一按钮可拉黑与解除
- [ ] 弹窗仅一个主操作按钮
- [ ] 已拉黑时弹窗显示徽章
- [ ] 黑名单页功能正常
- [ ] 未登录、非抖音页行为符合预期

---

## 相关文档

- [Partner Center 提交文案](partner-center-submission.zh-CN.md)
- [隐私政策](privacy-policy.zh-CN.md)
