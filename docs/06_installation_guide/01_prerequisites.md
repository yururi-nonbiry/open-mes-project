# 開発・実行環境の前提条件

本章では、open-mes-projectを開発・実行する環境の構築方法や、初期設定・起動手順、さらには利用中につまずきやすい点への対処方法について解説します。

## 対応OS

本システムはLinux環境での動作を想定しており、READMEでは **Ubuntu 24.04 LTS** 系での利用が推奨されています（サーバ用途にはUbuntu Server 24.04、開発用途にはUbuntu Desktop 24.04）。他のOS（Windows、macOS）でもDockerを介して動作可能です。Windows向けには、Dockerを使わずローカルにPython仮想環境を構築して起動する `start.bat` スクリプトも用意されていますが、現在のディレクトリ構成（`backend/src`、`backend/image`）に追随できておらず、旧パス（`open_mes\scr`等）を参照したままのため現状では動作しません（詳細は[セットアップ手順](./02_setup.md)を参照）。

## 必要ソフトウェア

Docker Composeで開発・実行する場合に必要なものは以下の通りです。

- **Docker**：アプリケーションをコンテナ環境で実行するために使用します。
- **Docker Compose**（`docker compose`プラグインまたはDocker Desktop同梱のCompose）：`db`（PostgreSQL）、`redis`、`backend`（Django）、`worker`（Celery）、`frontend`（React/Vite）の複数コンテナを一括管理するために使用します。
- **PostgreSQL / Redis**：いずれもDockerコンテナとして起動されるため、ホストへの個別インストールは不要です。ホスト側でDB内容を直接確認したい場合は`psql`クライアントがあると便利です。

Windows上でDockerを使わず`start.bat`経由でセットアップする想定は、以下（Python 3.11がインストールされ、PATHに追加されていること。pipも利用可能であること）ですが、前述の通り`start.bat`自体が現状動作しないため、実際にはDockerを利用したセットアップを推奨します。

## ハードウェア要件

小規模なデータであれば、メモリ2GB程度・CPUデュアルコアの環境でも動作可能ですが、Dockerを使うため多少のオーバーヘッドがあります。開発PCでは4GB以上のRAMを推奨します。ディスク容量はDockerイメージ（PostgreSQL、Redis、Python、Node.js/Viteのビルド環境）やデータ格納用に数GB程度必要です（データ量に応じて増加）。
