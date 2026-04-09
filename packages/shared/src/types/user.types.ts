import { UserRole } from '../enums';

export interface UserDto {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  branchId?: string;
  isActive: boolean;
  createdAt: Date;
}
