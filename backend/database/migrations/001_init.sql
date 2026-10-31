-- Dynamic Workflow Approval Management System : schema (MySQL 8+)

CREATE TABLE IF NOT EXISTS roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role_id INT NOT NULL,
  manager_id INT NULL,
  designation VARCHAR(100) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id),
  CONSTRAINT fk_users_manager FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS request_types (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(30) NOT NULL UNIQUE,
  description VARCHAR(255) NULL,
  requires_amount TINYINT(1) NOT NULL DEFAULT 0,
  requires_dates TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS workflows (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_type_id INT NOT NULL,
  name VARCHAR(150) NOT NULL,
  description VARCHAR(255) NULL,
  priority INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  current_version_id INT NULL,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_wf_type FOREIGN KEY (request_type_id) REFERENCES request_types(id),
  CONSTRAINT fk_wf_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Every edit of a workflow creates a NEW immutable version. Requests pin the version they were submitted with.
CREATE TABLE IF NOT EXISTS workflow_versions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  workflow_id INT NOT NULL,
  version_no INT NOT NULL,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_wf_version (workflow_id, version_no),
  CONSTRAINT fk_wfv_wf FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
  CONSTRAINT fk_wfv_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- All conditions of a version are AND-ed. No conditions = workflow applies to every request of the type.
CREATE TABLE IF NOT EXISTS workflow_conditions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  version_id INT NOT NULL,
  field ENUM('amount','days') NOT NULL,
  operator ENUM('eq','gt','gte','lt','lte','between') NOT NULL,
  value DECIMAL(14,2) NOT NULL,
  value2 DECIMAL(14,2) NULL,
  CONSTRAINT fk_wfc_version FOREIGN KEY (version_id) REFERENCES workflow_versions(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS workflow_steps (
  id INT AUTO_INCREMENT PRIMARY KEY,
  version_id INT NOT NULL,
  step_order INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  approver_type ENUM('USER','ROLE','MANAGER') NOT NULL,
  approver_user_id INT NULL,
  approver_role_id INT NULL,
  escalation_hours DECIMAL(6,2) NULL,
  escalate_to_user_id INT NULL,
  UNIQUE KEY uq_step_order (version_id, step_order),
  CONSTRAINT fk_wfs_version FOREIGN KEY (version_id) REFERENCES workflow_versions(id) ON DELETE CASCADE,
  CONSTRAINT fk_wfs_user FOREIGN KEY (approver_user_id) REFERENCES users(id),
  CONSTRAINT fk_wfs_role FOREIGN KEY (approver_role_id) REFERENCES roles(id),
  CONSTRAINT fk_wfs_esc FOREIGN KEY (escalate_to_user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_no VARCHAR(20) NULL UNIQUE,
  request_type_id INT NOT NULL,
  requester_id INT NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT NULL,
  amount DECIMAL(14,2) NULL,
  start_date DATE NULL,
  end_date DATE NULL,
  days INT NULL,
  status ENUM('DRAFT','PENDING','APPROVED','REJECTED','CHANGES_REQUESTED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
  workflow_id INT NULL,
  workflow_version_id INT NULL,
  current_cycle INT NOT NULL DEFAULT 0,
  current_step_order INT NULL,
  submitted_at DATETIME NULL,
  completed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_req_status (status),
  INDEX idx_req_requester (requester_id),
  CONSTRAINT fk_req_type FOREIGN KEY (request_type_id) REFERENCES request_types(id),
  CONSTRAINT fk_req_user FOREIGN KEY (requester_id) REFERENCES users(id),
  CONSTRAINT fk_req_wf FOREIGN KEY (workflow_id) REFERENCES workflows(id),
  CONSTRAINT fk_req_wfv FOREIGN KEY (workflow_version_id) REFERENCES workflow_versions(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS request_attachments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_id INT NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  stored_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NULL,
  size INT NOT NULL,
  uploaded_by INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_att_req FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE,
  CONSTRAINT fk_att_user FOREIGN KEY (uploaded_by) REFERENCES users(id)
) ENGINE=InnoDB;

-- One row per step per approval cycle. UNIQUE(request, cycle, step) makes duplicates impossible.
CREATE TABLE IF NOT EXISTS approval_instances (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_id INT NOT NULL,
  cycle_no INT NOT NULL,
  step_id INT NOT NULL,
  step_order INT NOT NULL,
  step_name VARCHAR(100) NOT NULL,
  assigned_user_id INT NULL,
  assigned_role_id INT NULL,
  status ENUM('WAITING','PENDING','APPROVED','REJECTED','CHANGES_REQUESTED','SKIPPED','CANCELLED') NOT NULL DEFAULT 'WAITING',
  due_at DATETIME NULL,
  escalated TINYINT(1) NOT NULL DEFAULT 0,
  escalated_at DATETIME NULL,
  acted_by INT NULL,
  acted_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_instance (request_id, cycle_no, step_order),
  INDEX idx_inst_assignee (assigned_user_id, status),
  INDEX idx_inst_due (status, due_at),
  CONSTRAINT fk_ai_req FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE,
  CONSTRAINT fk_ai_step FOREIGN KEY (step_id) REFERENCES workflow_steps(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS approval_actions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_id INT NOT NULL,
  approval_instance_id INT NULL,
  cycle_no INT NOT NULL,
  actor_id INT NULL,
  action ENUM('SUBMITTED','APPROVED','REJECTED','CHANGES_REQUESTED','CANCELLED','ESCALATED','SKIPPED') NOT NULL,
  comments TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_act_request (request_id),
  INDEX idx_act_actor (actor_id),
  CONSTRAINT fk_aa_req FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE,
  CONSTRAINT fk_aa_inst FOREIGN KEY (approval_instance_id) REFERENCES approval_instances(id) ON DELETE SET NULL,
  CONSTRAINT fk_aa_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  request_id INT NULL,
  message VARCHAR(255) NOT NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notif_user (user_id, is_read),
  CONSTRAINT fk_n_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_n_req FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  action VARCHAR(60) NOT NULL,
  entity_type VARCHAR(40) NOT NULL,
  entity_id INT NULL,
  details JSON NULL,
  ip_address VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_entity (entity_type, entity_id),
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;
