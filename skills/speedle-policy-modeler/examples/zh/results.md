# 验证结果 — 中文示例

运行日期：2026-11-06
Speedle 源码：`teramoby/speedle-plus` master，提交
`490a21a0ea87d80b244db8435a25314b6a24cfbc`
工具链：`go1.27.3 darwin/arm64`；macOS 27.0.1
模型：`policies.spdl`（1 个服务，18 条授权策略，17 条角色策略）
用例：`test-cases.json`（37 条）

## 命令

```bash
# 在本目录执行；使用 Speedle 构建产物，不要使用 macOS 的 /usr/sbin/spctl
export SPEEDLE_SPCTL=/path/to/speedle-plus/bin/spctl
export SPEEDLE_PMS=/path/to/speedle-plus/bin/speedle-pms
export SPEEDLE_ADS=/path/to/speedle-plus/bin/speedle-ads

"$SPEEDLE_SPCTL" check -f policies.spdl

# 在空闲回环端口启动 PMS 和 ADS，运行全部用例，然后停止两个服务
../../scripts/validate-model.sh policies.spdl test-cases.json
```

macOS 自带的 `/usr/sbin/spctl` 是 Apple 的 Gatekeeper 工具。必须将 `SPEEDLE_SPCTL` 显式设置为
Speedle CLI 的路径；验证脚本会拒绝 `PATH` 中非 Speedle 的候选程序。

验证脚本只读取 `.spdl` 文件。这是文件存储导入，不是管理写入。脚本退出时通过 trap
停止两个服务器；没有遗留进程。

## `spctl check` 输出

```text
policies.spdl: OK, 1 service(s), 18 policies, 17 role policies
```

## 端到端输出

```text
==> spctl check -f policies.spdl
policies.spdl: OK, 1 service(s), 18 policies, 17 role policies
==> starting PMS on 127.0.0.1:55627 and ADS on 127.0.0.1:55628
==> running test cases against ADS
service: northstar_hr
cases:   37
PASS T01 员工读取员工手册
     expected allowed=true reason=GRANT_POLICY_FOUND (0); got allowed=true reason=GRANT_POLICY_FOUND (0)
PASS T02 员工读取自己的员工档案
     expected allowed=true reason=GRANT_POLICY_FOUND (0); got allowed=true reason=GRANT_POLICY_FOUND (0)
PASS T03 员工不能读取其他员工的档案
     expected allowed=false reason=NO_APPLICABLE_POLICIES (3); got allowed=false reason=NO_APPLICABLE_POLICIES (3)
PASS T04 HR 专员读取本工作地点、非受限的档案
     expected allowed=true reason=GRANT_POLICY_FOUND (0); got allowed=true reason=GRANT_POLICY_FOUND (0)
PASS T05 HR 专员不能读取其他工作地点的档案
     expected allowed=false reason=NO_APPLICABLE_POLICIES (3); got allowed=false reason=NO_APPLICABLE_POLICIES (3)
PASS T06 HR 专员不能读取薪资数据
     expected allowed=false reason=NO_APPLICABLE_POLICIES (3); got allowed=false reason=NO_APPLICABLE_POLICIES (3)
PASS T07 HR 经理读取薪资数据
     expected allowed=true reason=GRANT_POLICY_FOUND (0); got allowed=true reason=GRANT_POLICY_FOUND (0)
PASS T08 HR 经理更新非受限的员工档案
     expected allowed=true reason=GRANT_POLICY_FOUND (0); got allowed=true reason=GRANT_POLICY_FOUND (0)
PASS T09 HR 经理不能更新受限的员工档案
     expected allowed=false reason=NO_APPLICABLE_POLICIES (3); got allowed=false reason=NO_APPLICABLE_POLICIES (3)
PASS T10 薪资管理员更新薪资数据
     expected allowed=true reason=GRANT_POLICY_FOUND (0); got allowed=true reason=GRANT_POLICY_FOUND (0)
PASS T11 财务分析师读取部门财务报告
     expected allowed=true reason=GRANT_POLICY_FOUND (0); got allowed=true reason=GRANT_POLICY_FOUND (0)
PASS T12 财务分析师不能读取高管财务报告
     expected allowed=false reason=NO_APPLICABLE_POLICIES (3); got allowed=false reason=NO_APPLICABLE_POLICIES (3)
PASS T13 高管读取高管财务报告
     expected allowed=true reason=GRANT_POLICY_FOUND (0); got allowed=true reason=GRANT_POLICY_FOUND (0)
PASS T14 部门经理审批本部门、限额内的支出
     expected allowed=true reason=GRANT_POLICY_FOUND (0); got allowed=true reason=GRANT_POLICY_FOUND (0)
PASS T15 部门经理不能审批其他部门的支出
     expected allowed=false reason=NO_APPLICABLE_POLICIES (3); got allowed=false reason=NO_APPLICABLE_POLICIES (3)
PASS T16 部门经理不能审批超过 5,000 的支出
     expected allowed=false reason=NO_APPLICABLE_POLICIES (3); got allowed=false reason=NO_APPLICABLE_POLICIES (3)
PASS T17 财务分析师审批 5,000 至 25,000 的支出
     expected allowed=true reason=GRANT_POLICY_FOUND (0); got allowed=true reason=GRANT_POLICY_FOUND (0)
PASS T18 财务分析师不能审批超过 25,000 的支出
     expected allowed=false reason=NO_APPLICABLE_POLICIES (3); got allowed=false reason=NO_APPLICABLE_POLICIES (3)
PASS T19 高管审批超过 25,000 的支出
     expected allowed=true reason=GRANT_POLICY_FOUND (0); got allowed=true reason=GRANT_POLICY_FOUND (0)
PASS T20 明确拒绝阻止外包人员读取内部机密数据
     expected allowed=false reason=DENY_POLICY_FOUND (1); got allowed=false reason=DENY_POLICY_FOUND (1)
PASS T21 员工读取内部机密数据
     expected allowed=true reason=GRANT_POLICY_FOUND (0); got allowed=true reason=GRANT_POLICY_FOUND (0)
PASS T22 安全专员通过继承的员工角色读取审计日志
     expected allowed=true reason=GRANT_POLICY_FOUND (0); got allowed=true reason=GRANT_POLICY_FOUND (0)
PASS T23 安全专员不能读取薪资数据
     expected allowed=false reason=NO_APPLICABLE_POLICIES (3); got allowed=false reason=NO_APPLICABLE_POLICIES (3)
PASS T24 payroll_sync 服务账号读取薪资批次
     expected allowed=true reason=GRANT_POLICY_FOUND (0); got allowed=true reason=GRANT_POLICY_FOUND (0)
PASS T25 人类员工不能读取薪资批次
     expected allowed=false reason=NO_APPLICABLE_POLICIES (3); got allowed=false reason=NO_APPLICABLE_POLICIES (3)
PASS T26 HR 经理读取不受地点和级别条件限制的档案
     expected allowed=true reason=GRANT_POLICY_FOUND (0); got allowed=true reason=GRANT_POLICY_FOUND (0)
PASS T27 HR 专员不能读取受限档案
     expected allowed=false reason=NO_APPLICABLE_POLICIES (3); got allowed=false reason=NO_APPLICABLE_POLICIES (3)
PASS T28 高管继承经理和员工角色
     expected allowed=true reason=GRANT_POLICY_FOUND (0); got allowed=true reason=GRANT_POLICY_FOUND (0)
PASS T29 外包人员可以读取手册，但不能读取机密数据
     expected allowed=true reason=GRANT_POLICY_FOUND (0); got allowed=true reason=GRANT_POLICY_FOUND (0)
PASS T30 另一位员工读取员工手册
     expected allowed=true reason=GRANT_POLICY_FOUND (0); got allowed=true reason=GRANT_POLICY_FOUND (0)
PASS T31 员工读取公开数据
     expected allowed=true reason=GRANT_POLICY_FOUND (0); got allowed=true reason=GRANT_POLICY_FOUND (0)
PASS T32 外包人员读取公开数据
     expected allowed=true reason=GRANT_POLICY_FOUND (0); got allowed=true reason=GRANT_POLICY_FOUND (0)
PASS T33 经理审批上限包含 5,000
     expected allowed=true reason=GRANT_POLICY_FOUND (0); got allowed=true reason=GRANT_POLICY_FOUND (0)
PASS T34 经理不能审批 5,000.01
     expected allowed=false reason=NO_APPLICABLE_POLICIES (3); got allowed=false reason=NO_APPLICABLE_POLICIES (3)
PASS T35 财务分析师上限包含 25,000
     expected allowed=true reason=GRANT_POLICY_FOUND (0); got allowed=true reason=GRANT_POLICY_FOUND (0)
PASS T36 财务分析师不能审批 25,000.01
     expected allowed=false reason=NO_APPLICABLE_POLICIES (3); got allowed=false reason=NO_APPLICABLE_POLICIES (3)
PASS T37 员工读取员工通讯录
     expected allowed=true reason=GRANT_POLICY_FOUND (0); got allowed=true reason=GRANT_POLICY_FOUND (0)

37/37 cases passed
==> all checks passed
```

## 结果

37 条文档用例全部通过。PMS 和 ADS 从同一份 `.spdl` 文件加载，`spctl check` 退出码为 0。
两种拒绝原因可以区分：T20 返回 `DENY_POLICY_FOUND`（1），因为外包人员的明确拒绝命中；
其他拒绝返回 `NO_APPLICABLE_POLICIES`（3），因为没有授予命中。
