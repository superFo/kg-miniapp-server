CREATE DATABASE IF NOT EXISTS `kg_patents` DEFAULT CHARSET utf8mb4;
USE `kg_patents`;

CREATE TABLE IF NOT EXISTS `patents` (
  `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
  `pub_no` VARCHAR(32) NOT NULL COMMENT '公开(公告)号',
  `app_no` VARCHAR(32) NULL COMMENT '申请号',
  `title` VARCHAR(512) NOT NULL,
  `abstract` TEXT NULL,
  `app_date` DATE NULL,
  `pub_date` DATE NULL,
  `inventors` TEXT NULL,
  `inventor_count` INT NULL,
  `applicants_current` TEXT NULL COMMENT '[标]当前申请(专利权)人',
  `applicants_current_count` INT NULL,
  `ipc` TEXT NULL,
  `ipc_main` VARCHAR(64) NULL,
  `ipc_main_prefix` VARCHAR(16) NULL,
  `non_patent_citations` INT NULL,
  `legal_status` TEXT NULL,
  `cited_by` TEXT NULL,
  `cites` TEXT NULL,
  `apply_year` INT NULL,
  `patsnap_family_count` INT NULL,
  `office` VARCHAR(64) NULL,
  `patent_type` ENUM('发明','实用新型','外观设计') NULL,
  `grant_flag` TINYINT(1) NULL,
  UNIQUE KEY `uk_pub_no` (`pub_no`),
  FULLTEXT KEY `ft_title_abs` (`title`, `abstract`),
  KEY `idx_apply_year` (`apply_year`),
  KEY `idx_ipc_prefix` (`ipc_main_prefix`),
  KEY `idx_patent_type` (`patent_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


