import torch
from postprocessed import get_post_processed_cc3d
from monai.inferers import sliding_window_inference
import nibabel as nib
import numpy as np
import os
import dipy
import dipy.io.peaks
import get_midsagittal as gm
import gets 
import pandas as pd
import time

def _build_parc_row(sub, parcellation_dict):
    """Build a parcellation row for the subject in the same format as ROQS."""
    row = {'Name': sub}
    for method_p in ['Witelson', 'Hofer', 'Chao', 'Cover', 'Freesurfer']:
        for part in ['P1', 'P2', 'P3', 'P4', 'P5']:
            for scalar in ['FA', 'FA StdDev', 'MD', 'MD StdDev', 'RD', 'RD StdDev', 'AD', 'AD StdDev']:
                try:
                    row[f'{method_p}_{scalar}_{part}'] = parcellation_dict[method_p][part][scalar]
                except Exception:
                    row[f'{method_p}_{scalar}_{part}'] = 0.0
    return row

def test_predict(model, data_paths):
	# Device preference from the UI (Settings → CNN compute device), via env var.
	_pref = os.environ.get("INCCSIGHT_DEVICE", "auto").lower()
	if _pref == "cpu":
		device = torch.device("cpu")
	else:
		device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
	if _pref in ("gpu", "cuda") and device.type != "cuda":
		print("[CNN] GPU requested but CUDA is unavailable — falling back to CPU.", flush=True)
	print(f"[CNN] Using device: {device}", flush=True)

	vol_file = "iso_dti_FA_norm.nii.gz"

	with torch.no_grad():

		# Variables
		vol_data = None
		test_outputs = None
		pos_process = None
		vol_data_affine = None

		names = []
		meanFAList = []
		stdFAList = []
		meanMDList = []
		stdMDList = []
		meanRDList = []
		stdRDList = []
		meanADList = []
		stdADList = []
		parcellationsList = {"CNN": {}}
		cnn_parcellationStatsList = []
		cnn_midlinesList = []
		times = []

		
		for data_path in data_paths:
			try:
				start = time.time()
				# Normalize name to match ROQS convention (Subject_ prefix).
				_code = os.path.basename(data_path)
				sub = _code if _code.startswith('Subject_') else f'Subject_{_code}'

				print(f"[CNN] Processing subject: {data_path}", flush=True)

				vol_path = os.path.join(data_path, vol_file)
				vol_data = nib.load(vol_path).get_fdata().astype(np.float32)
				vol_data = (vol_data - vol_data.min()) / (vol_data.max() - vol_data.min())
				vol_data_affine = nib.load(vol_path).affine

				vol_data = torch.from_numpy(vol_data).unsqueeze(0).unsqueeze(0)

				test_outputs = sliding_window_inference(
					vol_data,
					roi_size=(112, 160, 56),
					sw_batch_size=1, 
					predictor=model,
					overlap=0.1,
					mode="gaussian",
					device=torch.device(device)
				)

				vol_data = vol_data.cpu()

				test_outputs = test_outputs.cpu().squeeze().detach()

				test_outputs = (test_outputs > 0.7).float()

				pos_process = get_post_processed_cc3d(test_outputs)
				pos_process_save = pos_process.numpy()

				dipy.io.peaks.save_nifti(os.path.join(data_path, "inCCsight/cnnBased.nii.gz"), pos_process_save, vol_data_affine, hdr = None )

				# 2D

				wFA_v, FA_v, MD_v, RD_v, AD_v, fissure, T3, output_mask, FA_mean, FAmeanJo, FAmeanJo_min = gm.run_analysis(data_path)

				wFA = wFA_v[fissure,:,:]
				FA = FA_v[fissure,:,:]
				MD = MD_v[fissure,:,:]
				RD = RD_v[fissure,:,:]
				AD = AD_v[fissure,:,:]

				scalar_maps = (FA, MD, RD, AD)

				midsagittal = output_mask[fissure, :, :]

				values = gm.getParcellation(midsagittal, FA)
				parcellation_dict = gm.parcellations_dfs_dicts(scalar_maps, values)
				parcellationsList["CNN"][sub] = parcellation_dict
				cnn_parcellationStatsList.append(_build_parc_row(sub, parcellation_dict))

				midvolume = np.zeros(FA_v.shape)

				midvolume[fissure, :, :] = output_mask[fissure, :, :]

				dipy.io.peaks.save_nifti(os.path.join(data_path, "inCCsight/cnnBased_midsagittal.nii.gz"), midvolume, T3, hdr = None)
				dipy.io.peaks.save_nifti(os.path.join(data_path, "inCCsight/cnnBased_FA_V2.nii.gz"), FA_v, T3, hdr = None )

				# ── PNG midsagital CNN ───────────────────────────────────────
				try:
					import matplotlib
					matplotlib.use('Agg')
					import matplotlib.pyplot as plt
					from skimage import measure as sk_measure
					PANEL_BG = '#1F2C56'
					# Crop to the CC bounding box so the framing matches the
					# ROQS/Watershed midsagittal PNGs (same figsize/dpi, no colorbar).
					_rr = np.where(midsagittal.any(axis=1))[0]
					_cr = np.where(midsagittal.any(axis=0))[0]
					if _rr.size and _cr.size:
						_pr = 20
						_r0 = max(_rr[0] - _pr, 0);  _r1 = min(_rr[-1] + _pr, midsagittal.shape[0])
						_c0 = max(_cr[0] - _pr, 0);  _c1 = min(_cr[-1] + _pr, midsagittal.shape[1])
					else:
						_r0, _r1 = 0, midsagittal.shape[0]
						_c0, _c1 = 0, midsagittal.shape[1]
					fig_c, ax_c = plt.subplots(figsize=(4, 3), dpi=120, facecolor=PANEL_BG)
					ax_c.set_facecolor('#0d0d0d')
					ax_c.imshow(FA, cmap='gray', vmin=0, vmax=1)
					ax_c.set_xlim(_c0, _c1)
					ax_c.set_ylim(_r1, _r0)
					for c in sk_measure.find_contours(midsagittal.astype(float), 0.5):
						ax_c.plot(c[:, 1], c[:, 0], color='#00C896', linewidth=1.5)
					ax_c.set_xticks([]); ax_c.set_yticks([])
					for sp in ax_c.spines.values():
						sp.set_visible(False)
					ax_c.set_aspect('equal')
					fig_c.tight_layout(pad=0.1)
					os.makedirs(os.path.join(data_path, 'inCCsight'), exist_ok=True)
					fig_c.savefig(os.path.join(data_path, 'inCCsight', 'cnnBased_midsagittal.png'),
								  bbox_inches='tight', dpi=120, facecolor=PANEL_BG)
					plt.close(fig_c)
				except Exception:
					try: plt.close('all')
					except: pass

				scalar_statistics = gets.getScalars(midsagittal, FA, MD, RD, AD)

				try:
					cnn_midlines = {
						'FA': str([float(v) for v in gets.getFAmidline(midsagittal, FA, n_points=200)]),
						'MD': str([float(v) for v in gets.getFAmidline(midsagittal, MD, n_points=200)]),
						'RD': str([float(v) for v in gets.getFAmidline(midsagittal, RD, n_points=200)]),
						'AD': str([float(v) for v in gets.getFAmidline(midsagittal, AD, n_points=200)]),
					}
				except Exception:
					cnn_midlines = {'FA': '[]', 'MD': '[]', 'RD': '[]', 'AD': '[]'}
				cnn_midlinesList.append(cnn_midlines)

				names.append(sub)
				meanFAList.append(scalar_statistics[0])
				stdFAList.append(scalar_statistics[1])
				meanMDList.append(scalar_statistics[2])
				stdMDList.append(scalar_statistics[3])
				meanRDList.append(scalar_statistics[4])
				stdRDList.append(scalar_statistics[5])
				meanADList.append(scalar_statistics[6])
				stdADList.append(scalar_statistics[7])

				name = sub
				meanFA = scalar_statistics[0] 
				stdFA = scalar_statistics[1]
				meanMD = scalar_statistics[2]
				stdMD = scalar_statistics[3]
				meanRD = scalar_statistics[4]
				stdRD = scalar_statistics[5]
				meanAD = scalar_statistics[6]
				stdAD = scalar_statistics[7]
				
				end = time.time()
				times.append(round(end - start, 2))

			except Exception as _e:
				import traceback
				print(f"\n[ERROR] Failed to process {data_path}:")
				traceback.print_exc()
				continue

		subjects = {"Names": names, "FA": meanFAList, "FA StdDev": stdFAList, "MD": meanMDList, "MD StdDev": stdMDList,
              		"RD": meanRDList, "RD StdDev": stdRDList, "AD": meanADList, "AD StdDev": stdADList,
					"Time": times}

		df = pd.DataFrame(subjects)
		df.to_csv("./data/cnn_based.csv", sep=";")
		df.to_csv("../csvs/cnn_based.csv", sep=";")

		if cnn_parcellationStatsList:
			pd.DataFrame(cnn_parcellationStatsList).to_csv("../csvs/CNN_parcellation_statistics.csv", sep=";")

		if cnn_midlinesList:
			pd.DataFrame(cnn_midlinesList, index=names).to_csv("../csvs/CNN_scalar_midlines.csv", sep=";")

	return vol_data, test_outputs, pos_process, vol_data_affine
