type RouterOutputs = any; // TODO: replace with proper oRPC types when available
type RouterInputs = any; // TODO: replace with proper oRPC types when available

// Auth関連
export type RefreshResponse = RouterOutputs["auth"]["refresh"];
export type CheckUsernameResponse = RouterOutputs["auth"]["checkUsername"];
export type CompleteOAuthRegistrationResponse = RouterOutputs["auth"]["completeOAuthRegistration"];
export type MeResponse = RouterOutputs["auth"]["me"];
export type UserType = MeResponse;

// Rules関連
export type SearchRulesResponse = RouterOutputs["rules"]["search"];
export type RuleType = SearchRulesResponse["rules"][0];
export type ListRulesResponse = RouterOutputs["rules"]["list"];
export type CreateRuleResponse = RouterOutputs["rules"]["create"];
export type UpdateRuleResponse = RouterOutputs["rules"]["update"];
export type DeleteRuleResponse = RouterOutputs["rules"]["delete"];
export type GetRuleResponse = RouterOutputs["rules"]["get"];
export type GetByPathResponse = RouterOutputs["rules"]["getByPath"];
export type GetRuleContentResponse = RouterOutputs["rules"]["getContent"];
export type StarRuleResponse = RouterOutputs["rules"]["star"];
export type UnstarRuleResponse = RouterOutputs["rules"]["unstar"];
export type GetVersionsResponse = RouterOutputs["rules"]["versions"];
export type RuleVersionType = GetVersionsResponse[0];
export type GetRuleVersionResponse = RouterOutputs["rules"]["getVersion"];

// Users関連
export type SearchUsersResponse = RouterOutputs["users"]["searchByUsername"];
export type SearchUserType = SearchUsersResponse[0];
export type GetUserProfileResponse = RouterOutputs["users"]["getProfile"];
export type GetUserPublicProfileResponse = RouterOutputs["users"]["getPublicProfile"];

// Health関連
export type HealthCheckResponse = RouterOutputs["health"]["check"];

// Input types from RPC contracts
export type UpdateProfileInput = RouterInputs["users"]["updateProfile"];
export type CreateRuleInput = RouterInputs["rules"]["create"];
export type UpdateRuleInput = RouterInputs["rules"]["update"];
